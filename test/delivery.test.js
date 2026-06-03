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
    DeliveryConflict,
    Transaction,
    User,
    connection
} = require("../src/models");
const {
    bundles,
    generateToken,
    getDatas,
    otpHandler,
    postData,
    setupServer,
    syncUsers,
    users
} = require("./fixtures/helper");
const {
    badDelevery,
    deliveries,
    generateDBDeliveries,
    missoke,
} = require("./fixtures/deliveries.data");
const {deliveryStatuses} = require("../src/utils/config");
const {errors} = require("../src/utils/system-messages");
const {toDbPoint} = require("../src/utils/helpers");

describe("delivery CRUD test", function () {
    let server;
    let app;
    let dbUsers;
    let testDeliveries;

    before(function () {
        const tmp = setupServer(otpHandler);
        server = tmp.server;
        app = tmp.app;
    });

    beforeEach(async function () {
        let conflicts;
        this.timeout(30000);
        await connection.sync({force: true});
        dbUsers = await syncUsers(users, User);
        dbUsers = Object.entries(dbUsers).reduce(function (acc, [key, user]) {
            user.token = generateToken(user);
            acc[key] = user;
            return acc;
        }, Object.create(null));
        conflicts = generateDBDeliveries({
            clientId: dbUsers.goodUser.id,
            dbPointFormatter: toDbPoint,
            driverId: dbUsers.firstDriver.id,
            initialState: deliveryStatuses.inConflict
        })
        testDeliveries = await Delivery.bulkCreate(
            generateDBDeliveries({
                clientId: dbUsers.goodUser.id,
                dbPointFormatter: toDbPoint,
                driverId: dbUsers.firstDriver.id,
                initialState:  (index) => (
                    index === 0
                    ? deliveryStatuses.started
                    : deliveryStatuses.initial
                )
            }).concat(conflicts)
        );
        conflicts = testDeliveries.filter(
            (delivery) => delivery.status === deliveryStatuses.inConflict
        ).map((delivery, index) => Object.assign({}, {
            assigneeId: (
                index === 0
                ? dbUsers.secondDriver.id
                : null
            ),
            assignerId: (
                index === 0
                ? dbUsers.conflictManager.id
                : null
            ),
            deliveryId: delivery.id,
            lastLocation: toDbPoint(missoke),
            reporterId: dbUsers.firstDriver.id,
            type: "fake type"
        }));
        conflicts = await DeliveryConflict.bulkCreate(conflicts);
        await Promise.all(conflicts.map(function (conflict, index) {
            const delivery = testDeliveries[index + 3];
            delivery.conflictId = conflict.id;
            return delivery.save();
        }));
    });

    afterEach(async function () {
        this.timeout(30000);
        await connection.drop();
    });

    after(function () {
        server.close();
    });


    it("should return a 440 status on invalid location", async function () {
        let response = await postData({
            app,
            data: badDelevery,
            token: dbUsers.goodUser.token,
            url: "/delivery/request"
        });
        assert.equal(response.status, errors.invalidLocation.status);
    });
    it("should provide the infos of a delivery", async function () {
        let response = await getDatas({
            app,
            data: {id: null},
            token: dbUsers.goodUser.token,
            url: "/delivery/infos"
        });
        assert.equal(response.status, errors.invalidValues.status);
        response = await getDatas({
            app,
            data: {id: testDeliveries[0].id},
            token: dbUsers.goodUser.token,
            url: "/delivery/infos"
        });
        assert.equal(response.status, 200);
        assert.equal(response.body.driver.phone, dbUsers.firstDriver.phone);
    });

    it(
        "should not allow a client to fetch another one's delivery",
        async function () {
            let response = await getDatas({
                app,
                data: {id: testDeliveries[0].id},
                token: dbUsers.secondDriver.token,
                url: "/delivery/infos"
            });
            assert.equal(response.status, errors.forbiddenAccess.status);
        }
    );
    it("should allow a rate a delivery once terminated", async function () {
        let response;
        const ratingData = {
            id: testDeliveries[0].id,
            note: 4
        };
        response = await postData({
            app,
            data: ratingData,
            token: dbUsers.goodUser.token,
            url: "/delivery/rate"
        });
        assert.equal(response.status, errors.cannotPerformAction.status);
        testDeliveries[0].status = deliveryStatuses.terminated;
        await testDeliveries[0].save();
        response = await postData({
            app,
            data: ratingData,
            token: dbUsers.goodUser.token,
            url: "/delivery/rate"
        });
        assert.equal(response.status, 200);
        response = await postData({
            app,
            data: ratingData,
            token: dbUsers.goodUser.token,
            url: "/delivery/rate"
        });
        assert.equal(response.status, errors.alreadyRated.status);
    });

    it(
        "should only allow the delivery driver to verify code",
        async function () {
            //Note: goodUser is a client so he cannot verify the code
            let response;
            const verificationData = {
                code: testDeliveries[0].code,
                id: testDeliveries[0].id
            };
            response = await postData({
                app,
                data: verificationData,
                token: dbUsers.goodUser.token,
                url: "/delivery/verify-code"
            });
            assert.equal(response.status, errors.forbiddenAccess.status);
            response = await postData({
                app,
                data: verificationData,
                token: dbUsers.secondDriver.token,
                url: "/delivery/verify-code"
            });
            assert.equal(response.status, errors.forbiddenAccess.status);
        }
    );

    it(
        "should not verify a delivery which isn't in started status",
        async function () {
            let response;
            const data = {
                code: testDeliveries[1].code,
                id: testDeliveries[1].id
            };
            response = await postData({
                app,
                data,
                token: dbUsers.firstDriver.token,
                url: "/delivery/verify-code"
            });
            assert.equal(response.status, errors.cannotPerformAction.status);
        }
    );

    it("should provide the list of nearby drivers", async function () {
        const url = "/user/drivers";
        let response;
        dbUsers.firstDriver.position = toDbPoint(deliveries[0].departure);
        dbUsers.firstDriver.available = false;
        dbUsers.firstDriver.internal = true;
        dbUsers.secondDriver.position = toDbPoint(deliveries[0].departure);
        dbUsers.secondDriver.available = true;
        dbUsers.secondDriver.internal = true;
        await Promise.all([
            dbUsers.firstDriver.save(),
            dbUsers.secondDriver.save()
        ]);
        response = await getDatas({
            app,
            data: {from: deliveries[0].departure},
            token: dbUsers.conflictManager.token,
            url
        });
        assert.equal(response.body.result[0].id, dbUsers.secondDriver.id);
    });

    describe("delivery state mutation tests", function () {
        let data;
        beforeEach(async function () {
            this.timeout(30000);
            const purchase = Object.assign({}, bundles[0], {
                driverId: dbUsers.firstDriver.id,
                type: "recharge"
            });
            testDeliveries[1].driverId = null;
            data = {id: testDeliveries[1].id};
            await testDeliveries[1].save();
            console.log("testDeliveries updated");
            await Transaction.create(purchase);
            console.log("purchase created");
        });
        it("should approve a delivery request", async function () {
            console.log("started");
            const url = "/delivery/accept";
            let response = await postData({
                app,
                data,
                token: dbUsers.firstDriver.token,
                url
            });
            console.log("accepted");
            assert.equal(response.status, 200);
            response = await postData({
                app,
                data,
                token: dbUsers.firstDriver.token,
                url
            });
            console.log("re-accepted");
            assert.equal(response.status, errors.alreadyAssigned.status);
        });

        it(
            "should not approve a delivery if it's been cancelled",
            async function () {
                let response = await postData({
                    app,
                    data,
                    token: dbUsers.goodUser.token,
                    url: "/delivery/cancel"
                });
                assert.equal(response.status, 200);
                response = await postData({
                    app,
                    data,
                    token: dbUsers.firstDriver.token,
                    url: "/delivery/accept"
                });
                assert.equal(response.status, errors.alreadyCancelled.status);
            }
        );

        it("should signal the package reception", async function () {
            const url = "/delivery/signal-on-site";
            let response;
            testDeliveries[1].driverId = dbUsers.firstDriver.id;
            await testDeliveries[1].save();
            response = await postData({
                app,
                data,
                token: dbUsers.firstDriver.token,
                url
            });
            assert.equal(response.status, errors.cannotPerformAction.status);
            testDeliveries[1].status = deliveryStatuses.pendingReception;
            await testDeliveries[1].save();
            response = await postData({
                app,
                data,
                token: dbUsers.firstDriver.token,
                url
            });assert.equal(response.status, 200);
            response = await Delivery.findOne({where: data});
            assert.equal(response.status, deliveryStatuses.toBeConfirmed);
        });

        it("should confirm package deposit", async function () {
            const url = "/delivery/confirm-deposit";
            let response;
            testDeliveries[1].status = deliveryStatuses.pendingReception;
            testDeliveries[1].driverId = dbUsers.firstDriver.id;
            await testDeliveries[1].save();
            response = await postData({
                app,
                data,
                token: dbUsers.goodUser.token,
                url
            });
            assert.equal(response.status, errors.cannotPerformAction.status);
            testDeliveries[1].status = deliveryStatuses.toBeConfirmed;
            await testDeliveries[1].save();
            response = await postData({
                app,
                data,
                token: dbUsers.goodUser.token,
                url
            });
            assert.equal(response.status, 200);
            response = await Delivery.findOne({where: data});
            assert.equal(response.status, deliveryStatuses.started);
            assert.isNotNull(response.begin);
        });
    });
    it("should provide all ongoing deliveries", async function () {
        /* because the second Driver has been assigned to 1 conflict
           he will have 1 delivery as ongoing */
        let response = await getDatas({
            app,
            token: dbUsers.secondDriver.token,
            url: "/delivery/started"
        });
        assert.equal(response.body.deliveries.length, 1);
    });
    it("should provide all terminated deliveries", async function () {
        let response;
        testDeliveries[1].status = deliveryStatuses.terminated;
        testDeliveries[2].status = deliveryStatuses.terminated;
        await Promise.all([
            testDeliveries[1].save(),
            testDeliveries[2].save(),
        ])
        response = await getDatas({
            app,
            token: dbUsers.goodUser.token,
            url: "/delivery/terminated"
        });
        assert.equal(response.body.results.length, 2);
    });
    it(
        "should allow a recipient to fetch ongoing deliveries",
        async function () {
            /** Note that badUser phone is included in deliveries[0]
             * as a recipient
             */
            let response;
            const request = await postData({
                app,
                data: deliveries[0],
                token: dbUsers.goodUser.token,
                url: "/delivery/request"
            });
            await Delivery.update(
                {
                    driverId: dbUsers.firstDriver.id,
                    status: deliveryStatuses.toBeConfirmed
                },
                {where: {id: request.body.id}}
            );
            response = await getDatas({
                app,
                token: dbUsers.badUser.token,
                url: "/delivery/started"
            });
            assert.equal(response.body.deliveries.length, 1);
        }
    );

    it("should provide the opened conflict list", async function () {
        let response;
        response = await getDatas({
            app,
            token: dbUsers.conflictManager.token,
            url: "/delivery/conflict/all-new"
        });
        assert.equal(response.body.results?.length, 2);
    });
    it ("should provide a manager's conflicts", async function () {
        let response = await getDatas({
            app,
            token: dbUsers.conflictManager.token,
            url: "/delivery/conflict"
        });
        assert.equal(response.body.results?.length, 1);
    });

});
