/*jslint
node, nomen
*/
require("dotenv").config();
const fs = require("node:fs");
const {
    after,
    afterEach,
    before,
    beforeEach,
    describe,
    it
} = require("mocha");
const {assert} = require("chai");
const {
    Delivery,
    Registration,
    Sponsor,
    Sponsorship,
    User,
    connection
} = require("../src/models");
const {
    clientSocketCreator,
    generateToken,
    getDatas,
    listenEvent,
    otpHandler,
    postData,
    registerDriver,
    setupServer,
    subscriber,
    syncUsers,
    users
} = require("./fixtures/helper");
const getSocketManager = require("../src/utils/socket-manager");
const registrationHandler = require("../src/modules/driver.socket-handler");
const {errors} = require("../src/utils/system-messages");
const {fileExists, getFileHash} = require("../src/utils/helpers");
const {userStatuses} = require("../src/utils/config");

const carInfosPath = "test/fixtures/specs.pdf";
function generateSubscribers(total, fn) {
    const date = Date.now();
    return new Array(total).fill(subscriber).map(function (infos) {
        const random = Math.floor(Math.random() * 100000 * total);
        const driver = {};
        const id = "-" + random;
        Object.assign(driver, infos);
        driver.firstName = infos.firstName + id;
        driver.email = infos.email.replace("@", id + "@");
        driver.phoneNumber = infos.phoneNumber + id;
        driver.carInfos = carInfosPath;
        if (typeof fn === "function") {
            return fn(driver, new Date(date - random));
        }
        return driver;
    });
}
describe("registration tests", function () {
    let carInfoHash;
    let app;
    let server;
    let dbUsers;
    let managerToken;
    let socketServer;
    let sponsor;
    before(async function () {
        const tmp = setupServer(otpHandler);
        server = tmp.server;
        app = tmp.app;
        socketServer = getSocketManager({
            httpServer: server,
            registrationHandler: registrationHandler(Delivery)
        });
        carInfoHash = await getFileHash(carInfosPath);
        carInfoHash = "public/registrations/vamvam_" + carInfoHash + ".pdf";
    });

    beforeEach(async function () {
        const data = {
            code: "12334",
            name: "Trésor Dima",
            phone: "132129489433"
        };
        await connection.sync({force: true});
        dbUsers = await syncUsers(users, User);
        managerToken = generateToken(dbUsers.registrationManager);
        sponsor = await Sponsor.create(data);
    });

    afterEach(async function () {
        let hasUpload = await fileExists(carInfoHash);
        await connection.drop();
        if (hasUpload) {
            fs.unlink(carInfoHash, console.log);
        }
    });

    after(function () {
        socketServer.close();
        server.close();
    });
    it("should register a new driver", async function () {
        const driver = {};
        let response;
        Object.assign(driver, subscriber);
        await Registration.create(subscriber);
        response = await registerDriver({app, driver});
        assert.equal(response.status, errors.alreadyRegistered.status);
        driver.email = "driver@test.com";
        driver.phoneNumber = "2302930290032";
        response = await registerDriver({app, driver});
        assert.equal(response.status, errors.invalidValues.status);
        driver.carInfos = carInfosPath;
        response = await registerDriver({app, driver});
        assert.equal(response.status, 200);

    });
    it("should notify the manager on new registration", async function () {
        let driver = Object.create(null);
        let response;
        let socket;
        Object.assign(driver, subscriber);
        driver.carInfos = carInfosPath;
        socket = await clientSocketCreator("registration", managerToken);
        response = await registerDriver({app, driver});
        response = await listenEvent({name: "new-registration", socket});
        driver = await Registration.findOne(
            {where: {phoneNumber: driver.phoneNumber}}
        );
/*I've decided to verify only id because of an issue
with the date serialization to avoid false negative*/
        assert.equal(response.id, driver.toResponse().id);
    });
    it(
        "should enable the manager to update the registration",
        async function () {
            let registration;
            let response = generateSubscribers(1)[0];
            response.contributorId = dbUsers.registrationManager.id;
            registration = await Registration.create(response);
            response = await app.post("/driver/update-registration").field(
                "id",
                "a--fake--id--of--registration"
            ).field("firstName", "test").attach("carInfos", carInfosPath).set(
                "authorization",
                "Bearer " + managerToken
            );
            assert.equal(response.status, errors.notFound.status);
            response = await app.post("/driver/update-registration").field(
                "id",
                registration.id
            ).field("firstName", "test").attach("carInfos", carInfosPath).set(
                "authorization",
                "Bearer " + managerToken
            );
            assert.equal(response.status, 200);
        }
    );
    it(
        "should create a driver account on registration validation",
        async function () {
            let registration;
            let response = generateSubscribers(1)[0];
            response.sponsorCode = "12334";
            response.contributorId = dbUsers.registrationManager.id;
            registration = await Registration.create(response);
            response = await app.post("/driver/validate-registration").send({
                id: registration.id
            }).set("authorization", "Bearer " + managerToken);
            assert.equal(response.status, 200);
            response = await User.findOne({
                where: {phone: registration.phoneNumber}
            });
            assert.isNotNull(response);
            response = await app.post("/driver/reject-registration").send({
                id: registration.id
            }).set("authorization", "Bearer " + managerToken);
            assert.equal(response.status, errors.cannotPerformAction.status);
            response = await Sponsorship.findAll(
                {where: {sponsorId: sponsor.id}}
            );
            assert.equal(response.length, 1);
        }
    );
    it("should create an internal driver", async function () {
        const driver = Object.create(null);
        let response;
        Object.assign(driver, subscriber);
        driver.carInfos = carInfosPath;
        response = await registerDriver({
            app,
            driver,
            token: managerToken,
            url: "/driver/register-intern"
        });
        assert.equal(response.status, 200);
        response = await User.findOne({where: {id: response.body.id}});
        assert.isTrue(response.internal);
    });
    it("should provide the list of registration demands", async function () {
        let response;
        await Registration.bulkCreate(generateSubscribers(6).concat(
        generateSubscribers(3, function (registration) {
            let result = Object.assign({}, registration);
            result.contributorId = dbUsers.registrationManager.id;
            return result;
        })));
        response = await getDatas({
            app,
            token: managerToken,
            url: "/driver/registrations?name=Nkang"
        });
        assert.equal(response.body?.results?.length, 9);
    });
    it("should provide the list of settled registration", async function () {
        let response;
        const settle = (status) => function (registration) {
            let result = Object.assign({}, registration);
            result.contributorId = dbUsers.registrationManager.id;
            result.status = status;
            return result;
        }
        await Registration.bulkCreate(
            generateSubscribers(6, settle(userStatuses.activated)).concat(
                generateSubscribers(2, settle(userStatuses.rejected)).concat(
                    generateSubscribers(4, settle(undefined))
                )
            )
        );
        response = await getDatas({
            app,
            token: managerToken,
            url: "/driver/all-settled"
        });
        assert.equal(response.body.results.length, 8);
    });
    it("should allow a manager to handle a registration", async function () {
        let response;
        let data;
        const post = (data) => postData({
            app,
            data: {id: data.id},
            token: managerToken,
            url: "/driver/handle-registration"
        });
        data = await Registration.create(subscriber);
        response = await post(data);
        assert.equal(response.status, 200);
        response = await post(data);
        assert.equal(response.status, errors.alreadyAssigned.status);
    });
});
