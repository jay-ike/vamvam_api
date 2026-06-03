/*jslint
node, nomen
*/
require("dotenv").config();
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
    Settings,
    Sponsor,
    Sponsorship,
    User,
    connection
} = require("../src/models");
const {apiSettings, deliveryStatuses} = require("../src/utils/config");
const {toDbPoint} = require("../src/utils/helpers");
const {
    deliveries,
    generateDBDeliveries
} = require("./fixtures/deliveries.data");
const {
    generateToken,
    getDatas,
    otpHandler,
    postData,
    setupServer,
    subscriber,
    syncInstances,
    users
} = require("./fixtures/helper");

const newAdmins = [
    {
        email: "aMail@vamvamlogistics.com",
        password: "heyneverthinkofit",
        phoneNumber: "+234093059540955"
    },
    {
        email: "foobar@vamvamlogistics.com",
        password: "justguesswhat",
        phoneNumber: "+342098403984398439579398"
    }
];
describe("admin features tests", function () {
    let app;
    let server;
    let dbUsers;
    let deliveryGenerator;
    before(function () {
        const tmp = setupServer(otpHandler);
        app = tmp.app;
        server = tmp.server;
    });
    after(function () {
        server.close();
    });
    beforeEach(async function () {
        dbUsers = await connection.sync();
        dbUsers = await syncInstances(users, User, "phone");
        dbUsers = Object.entries(dbUsers).reduce(function (acc, [key, user]) {
            const clonedUser = Object.create(null);
            Object.assign(clonedUser, user.dataValues);
            clonedUser.token = generateToken(clonedUser);
            acc[key] = clonedUser;
            return acc;
        }, Object.create(null));
        await Settings.create({
            type: apiSettings.delivery.value,
            value: {"driver_search_radius": 2000}
        });
        deliveryGenerator = (initialState) => generateDBDeliveries({
            clientId: dbUsers.goodUser.id,
            dbPointFormatter: toDbPoint,
            driverId: dbUsers.firstDriver.id,
            initialState
        });
    });
    afterEach(async function () {
        await connection.drop();
    });
    it("should create a registration manager", async function () {
        let response;
        let data = newAdmins[0];
        data.type = "registration";
        response = await postData({
            app,
            data,
            token: dbUsers.admin.token,
            url: "/admin/new-admin"
        });
        assert.equal(response.status, 200);
    });
    it("should provide the list of user", async function () {
        const roles = ["client", "driver"];
        const expected = Object.values(dbUsers).reduce(
            (acc, val) => acc + (
                roles.includes(val.role)
                ? 1
                : 0
            ),
            0
        );
        let response = await getDatas({
            app,
            token: dbUsers.admin.token,
            url: "/user/all?role=client,driver"
        });
        assert.isTrue(response.body.results.every(
            (val) => roles.includes(val.role)
        ) && response.body.results.length === expected);
    });
    it("should provide the list of ongoing deliveries", async function () {
        let res;
        let fakeDatas = deliveryGenerator(deliveryStatuses.started).concat(
            deliveryGenerator(deliveryStatuses.terminated).concat(
                deliveryGenerator(deliveryStatuses.inConflict)
            )
        );
        await Delivery.bulkCreate(fakeDatas);
        res = await getDatas({
            app,
            token: dbUsers.admin.token,
            url: "/delivery/all?status=ongoing,terminated"
        });
        assert.equal(res.body.results.length, 2 * deliveries.length);
    });
    it("should update a setting", async function () {
        let data = {
            type: "delivery",
            value: {ttl: 5500}
        };
        let response = await postData({
            app,
            data,
            token: dbUsers.admin.token,
            url: "/admin/update-settings"
        });
        assert.equal(response.body.updated, true);
        response = await Settings.findOne({where: {type: "delivery-settings"}});
        assert.equal(response.dataValues.value.delivery_ttl, 5500);
    });
    it("should provide the users count analytics", async function () {
        const expected = {
            client: 2,
            "conflict-manager": 1,
            driver: 2,
            "registration-manager": 1,
            total: 7
        };
        let response = await getDatas({
            app,
            token: dbUsers.admin.token,
            url: "/user/analytics"
        });
        assert.deepEqual(response.body.users, expected);
    });
});

describe("sponsoring tests", function () {
    let app;
    const data = {
        code: "12345",
        name: "Trésor Dima",
        phone: "3434343443"
    };
    let server;
    let admin;
    let allUsers;
    let sponsors = [users.firstDriver, users.secondDriver];
    before(function () {
        const tmp = setupServer();
        app = tmp.app;
        server = tmp.server;
    });
    after(function () {
        server.close();
    });
    beforeEach(async function () {
        await connection.sync();
        sponsors = await Sponsor.bulkCreate(sponsors.map(function (user) {
            const result = Object.assign({}, user);
            const code = String(Math.floor(10000 * Math.random()));
            result.code = code;
            result.name = result.firstName + " " + result.lastName;
            result.phone = user.phone + "-" + code;
            return result;
        }));
        allUsers = new Array(10).fill(subscriber).map(function (user) {
            const result = {};
            const id = "-" + Math.floor(10000000 * Math.random());
            Object.assign(result, user);
            result.phone = result.phoneNumber + id;
            result.firstName += id;
            result.email = result.email.replace("@bar", id + "@bar");
            return result;
        });
        allUsers = await User.bulkCreate(allUsers);
        await Sponsorship.bulkCreate(allUsers.map(function (user, index) {
            let sponsorId;
            if (index % 3 === 0) {
                sponsorId = sponsors[0].id;
            } else {
                sponsorId = sponsors[1].id;
            }
            return {sponsorId, userId: user.id};
        }));
        admin = await User.create(users.admin);
        admin.token = generateToken(admin);
    });
    afterEach(async function () {
        await connection.drop();
    });
    it("should create a new sponsor", async function () {
        let response = await postData({
            app,
            data,
            token: admin.token,
            url: "/sponsor/create"
        });
        assert.equal(response.status, 200);
    });
    it("should provide the sponsor ranking", async function () {
        let response = await getDatas({
            app,
            token: admin.token,
            url: "/sponsor/ranking"
        });
        assert.equal(response.body.results.length, 2);
        assert.equal(response.body.results[0].sponsored, 6);
    });
    it("should list all users sponsored by a sponsor", async function () {
        let response = await getDatas({
            app,
            token: admin.token,
            url: "/sponsor/enrolled?id=" + sponsors[0].id
        });
        assert.equal(response.body.results.length, 4);
    });
});
