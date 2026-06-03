/*jslint node */
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
    Room,
    Transaction,
    User,
    connection
} = require("../src/models");
const {
    bundles,
    clientSocketCreator,
    generateToken,
    listenEvent,
    otpHandler,
    postData,
    setupServer,
    syncInstances,
    users
} = require("./fixtures/helper");
const {
    deliveries,
    generateDBDeliveries,
    missoke
} = require("./fixtures/deliveries.data");
const getSocketManager = require("../src/utils/socket-manager");
const getDeliveryHandler = require("../src/modules/delivery.socket-handler");
const getConflictHandler = require("../src/modules/conflict.socket-handler");
const {apiSettings, deliveryStatuses} = require("../src/utils/config");
const {errors} = require("../src/utils/system-messages");
const {toDbPoint} = require("../src/utils/helpers");

function updatePosition(socket, position) {
    socket.emit("new-position", position);
    return listenEvent({
        close: false,
        name: "position-updated",
        socket
    });
}
function updateItinerary({deliveryId, points, socket}) {
    socket.emit("itinerary-changed", {deliveryId, points});
    return listenEvent({
        close: false,
        name: "itinerary-update-fulfilled",
        socket
    });
}

describe("delivery side effects test", function () {
    let server;
    let app;
    let dbUsers;
    let socketServer;
    let testDeliveries;

    before(function () {
        const tmp = setupServer(otpHandler);
        server = tmp.server;
        app = tmp.app;
        socketServer = getSocketManager({
            conflictHandler: getConflictHandler(Delivery),
            deliveryHandler: getDeliveryHandler(Delivery),
            httpServer: server
        });
    });

    beforeEach(async function () {
        let purchase = bundles[0];
        purchase.type = "recharge";
        await connection.sync({force: true});
        dbUsers = await syncInstances(users, User, "phone");
        dbUsers = Object.entries(dbUsers).reduce(function (acc, [key, user]) {
            user.token = generateToken(user);
            acc[key] = user;
            return acc;
        }, Object.create(null));
        purchase.driverId = dbUsers.firstDriver.id;
        await Transaction.create(purchase);
        testDeliveries = await Delivery.bulkCreate(generateDBDeliveries({
            clientId: dbUsers.goodUser.id,
            dbPointFormatter: toDbPoint,
            driverId: dbUsers.firstDriver.id,
            initialState:  (index) => (
                index === 0
                ? deliveryStatuses.started
                : deliveryStatuses.initial
            )
        }));
    });

    afterEach(async function () {
        await connection.drop();
    });

    after(function () {
        socketServer.close();
        server.close();
    });

    it("should reject if a user is not authenticated", async function () {
        try {
            await clientSocketCreator("delivery");
        } catch (error) {
            assert.deepEqual(error.data, errors.notAuthorized.message);
        }
    });
    describe("delivery initialization interactions", function () {
        let initialRequest;
        const nearByPoint = { /* Near to the first delivery departure */
        latitude: 4.092361,
        longitude: 9.745081
    };
    const farPoint = {
        latitude: 3.989972,
        longitude: 9.799537
    };
    beforeEach(async function () {
        initialRequest = await postData({
            app,
            data: deliveries[0],
            token: dbUsers.goodUser.token,
            url: "/delivery/request"
        });
        initialRequest = initialRequest.body;
    });
    it(
        "should notify the client & the recipients on driver position's update",
        async function () {
            let data;
            const [client, driver, other] = await Promise.all([
                clientSocketCreator("delivery", dbUsers.goodUser.token),
                clientSocketCreator("delivery", dbUsers.secondDriver.token),
                clientSocketCreator("delivery", dbUsers.badUser.token)
            ]);
            await Delivery.update({
                status: deliveryStatuses.pendingReception,
                driverId: dbUsers.secondDriver.id
            }, {where: {id: initialRequest.id}});
            await updatePosition(driver, missoke);
            data = await Promise.allSettled([
                listenEvent({name: "new-driver-position", socket: client}),
                listenEvent({name: "new-driver-position", socket: other})
            ]);
            assert.deepEqual(
                data.map((response) => response.value),
                Array(2).fill({
                    deliveryId: initialRequest.id,
                    positions: missoke
                })
            );
            data = await User.findOne({where: {id: dbUsers.secondDriver.id}});
            assert.deepEqual(data.position, toDbPoint(missoke));
        }
    );
    it("should notify a client on driver approval", async function () {
            let data;
            const [client, driver, other] = await Promise.all([
                clientSocketCreator("delivery", dbUsers.goodUser.token),
                clientSocketCreator("delivery", dbUsers.firstDriver.token),
                clientSocketCreator("delivery", dbUsers.badUser.token)
            ]);
            data = await postData({
                app,
                data: {id: initialRequest.id},
                token: dbUsers.firstDriver.token,
                url: "/delivery/accept"
            })
            data = await Promise.all([
                listenEvent({
                    close: false,
                    name: "delivery-accepted",
                    socket: client
                }),
                listenEvent({
                    close: false,
                    name: "new-invitation",
                    socket: other
                })
            ]);
            assert.deepEqual(data[0], {
                deliveryId: initialRequest.id,
                driver: dbUsers.firstDriver.toShortResponse()
            });
            assert.deepEqual(data[1].id, initialRequest.id);
            data = await listenEvent({
                close: false,
                name: "point-widthdrawn",
                socket: driver
            });
            assert.deepEqual(data, {amount: 300, bonus: 0, point: 1});
            data = await Promise.allSettled([
                listenEvent({name: "room-created", socket: client}),
                listenEvent({name: "room-created", socket: driver}),
                listenEvent({name: "room-created", socket: other})
            ]);
            assert.isTrue(data.every((item) => item.value?.id !== undefined));
            assert.deepEqual(data[0].value, data[1].value);
            data = await Room.findOne({where: {id: data[0].value.id}});
            assert.isNotNull(data);
        });

        it("should notify a driver on client cancellation", async function () {
            let data;
            const driverSocket = await clientSocketCreator(
                "delivery",
                dbUsers.firstDriver.token
            );
            dbUsers.firstDriver.position = toDbPoint(nearByPoint);
            await dbUsers.firstDriver.save();
            data =  await postData({
                app,
                data: {id: initialRequest.id},
                token: dbUsers.goodUser.token,
                url: "/delivery/cancel"
            });
            data = await listenEvent({
                name: "delivery-cancelled",
                socket: driverSocket
            });
            assert.equal(data.id, initialRequest.id);
        });
        it("should notify the client on driver reception", async function () {
            let data = {id: initialRequest.id};
            const client = await clientSocketCreator(
                "delivery",
                dbUsers.goodUser.token
            );
            await Delivery.update({
                driverId: dbUsers.firstDriver.id,
                status: deliveryStatuses.pendingReception
            }, {where: data});
            await app.post("/delivery/signal-on-site").send(data).set(
                "authorization",
                "Bearer " + dbUsers.firstDriver.token
            );
            data = await listenEvent({
                name: "driver-on-site",
                socket: client
            });
            assert.equal(data, initialRequest.id);
        });
        it(
            "should notify delivery's begining on client confirmation",
            async function () {
                let data = {id: initialRequest.id};
                const [client, driverSocket] = await Promise.all([
                    clientSocketCreator("delivery", dbUsers.goodUser.token),
                    clientSocketCreator("delivery", dbUsers.firstDriver.token),
                ]);
                await Delivery.update({
                    driverId: dbUsers.firstDriver.id,
                    status: deliveryStatuses.toBeConfirmed
                }, {where: data});
                await app.post("/delivery/confirm-deposit").send(data).set(
                    "authorization",
                    "Bearer " + dbUsers.goodUser.token
                );
                data = await Promise.all([
                    listenEvent({
                        name: "delivery-started",
                        socket: client
                    }),
                    listenEvent({
                        name: "delivery-started",
                        socket: driverSocket
                    })
                ]);
                assert.deepEqual(data, new Array(2).fill(initialRequest.id));
            }
        );
        it(
            "should notify the nearBy drivers on new delivery",
            async function () {
                let data;
                let delivery;
                let [firstDriver, secondDriver] = await Promise.all([
                    clientSocketCreator("delivery", dbUsers.firstDriver.token),
                    clientSocketCreator("delivery", dbUsers.secondDriver.token)
                ]);
                await Promise.all([
                    updatePosition(firstDriver, nearByPoint),
                    updatePosition(secondDriver, farPoint)
                ]);
                initialRequest = await app.post("/delivery/request").send(
                    deliveries[0]
                ).set("authorization", "Bearer " + dbUsers.goodUser.token);
                data = await Promise.allSettled([
                    listenEvent({
                        name: "new-delivery",
                        socket: firstDriver
                    }),
                    listenEvent({
                        name: "new-delivery",
                        socket: secondDriver
                    })
                ]);
                delivery = await Delivery.findOne(
                    {where: {id: initialRequest.body.id}}
                );
                delivery = delivery.toResponse();
                delivery.client = dbUsers.goodUser.toShortResponse();
                assert.deepEqual(
                    data.map((data) => data.value),
                    [delivery, undefined]
                );
            }
        );
        it("should enable a driver to update the itinerary", async function () {
            let data;
            const route = [
                {latitude: 4.045288, longitude: 9.713716},
                {latitude: 4.045502, longitude: 9.714724},
                {latitude: 4.046626, longitude: 9.716999}
            ];
            const [client, driver, other] = await Promise.all([
                clientSocketCreator("delivery", dbUsers.goodUser.token),
                clientSocketCreator("delivery", dbUsers.firstDriver.token),
                clientSocketCreator("delivery", dbUsers.badUser.token)
            ]);
            await Delivery.update({
                status: deliveryStatuses.pendingReception,
                driverId: dbUsers.firstDriver.id
            }, {where: {id: initialRequest.id}});
            await updateItinerary({
                deliveryId: initialRequest.id,
                points: route,
                socket: driver
            });
            data = await Promise.all([
                listenEvent({name: "itinerary-updated", socket: client}),
                listenEvent({name: "itinerary-updated", socket: other})
            ]);
            assert.deepEqual(data, Array(2).fill(
                {deliveryId: initialRequest.id, points: route}
            ));
        });

        it(
            "should notify the client on delivery closed",
            async function () {
                let data;
                const [client, driver, other] = await Promise.all([
                    clientSocketCreator("delivery", dbUsers.goodUser.token),
                    clientSocketCreator("delivery", dbUsers.firstDriver.token),
                    clientSocketCreator("delivery", dbUsers.badUser.token)
                ]);
                const room = await Room.create({
                    name: "hello world",
                    deliveryId: initialRequest.id
                });
                await Delivery.update({
                    status: deliveryStatuses.started,
                    driverId: dbUsers.firstDriver.id
                }, {where: {id: initialRequest.id}});
                data = await postData({
                    app,
                    data: {
                        code: initialRequest.code,
                        id: initialRequest.id
                    },
                    token: dbUsers.firstDriver.token,
                    url: "/delivery/verify-code"
                });
                data = await Promise.all([
                    listenEvent(
                        {close: false, name: "delivery-end", socket: client}
                    ),
                    listenEvent(
                        {close: false, name: "delivery-end", socket: other}
                    )
                ]);
                assert.deepEqual(data, Array(2).fill(initialRequest.id));
                data = await Promise.allSettled([
                    listenEvent({name: "room-deleted", socket: client}),
                    listenEvent({name: "room-deleted", socket: driver}),
                    listenEvent({name: "room-deleted", socket: other})
                ]);
                assert.deepEqual(
                    data.map((result) => result.value),
                    Array(3).fill({id: room.id, name: room.name})
                );
            }
        );
    });
    describe("conflict tests", function () {
        let message;
        let conflict;
        let room;
        let types = apiSettings.delivery.defaultValues.delivery_conflicts;
        beforeEach(async function () {
            room = await Room.create({
                name: "fake room",
                deliveryId: testDeliveries[0].id
            });
            await room.setUsers([
                dbUsers.goodUser,
                dbUsers.firstDriver
            ]);
            conflict = await DeliveryConflict.create({
                deliveryId: testDeliveries[2].id,
                lastLocation: toDbPoint(missoke),
                type: types[1].code
            });
            await Delivery.update({
                conflictId: conflict.id,
                driverId: dbUsers.firstDriver.id,
                status: deliveryStatuses.inConflict
            }, {where: {id: testDeliveries[2].id}});
            message = {
                lastPosition: missoke,
                reporter: dbUsers.firstDriver.toResponse(),
                type: types[0].code
            };
        });
        it(
            "should notify the manager and client on conflict",
            async function () {
                let newConflict;
                let data = {
                    conflictType: message.type,
                    id: testDeliveries[0].id,
                    lastPosition: missoke
                };
                let [client, conflictManager] = await Promise.all([
                    await clientSocketCreator(
                        "delivery", dbUsers.goodUser.token
                    ),
                    await clientSocketCreator(
                        "conflict", dbUsers.conflictManager.token
                    )
                ]);
                data = await postData({
                    app,
                    data,
                    token: dbUsers.firstDriver.token,
                    url: "/delivery/conflict/report"
                });
                data = await Promise.all([
                    listenEvent({
                        name: "new-conflict",
                        socket: conflictManager
                    }),
                    listenEvent({name: "new-conflict", socket: client})
                ]);
                newConflict = await DeliveryConflict.findOne({where: {
                    deliveryId: testDeliveries[0].id
                }});
                message.id = newConflict.id;
                message.delivery = await Delivery.findOne(
                    {where: {id: testDeliveries[0].id}}
                );
                message.delivery = message.delivery.toResponse();
                message.reporter = dbUsers.firstDriver.toShortResponse();
                assert.deepEqual(data, [message, testDeliveries[0].id]);
            }
        );

        it("should notify a driver on new assignment", async function () {
            let response;
            const url = "/delivery/conflict/assign-driver";
            let sockets;
            let payload = {
                driverId: dbUsers.secondDriver.id,
                id: conflict.id
            };
            sockets = await Promise.all([
                clientSocketCreator("delivery", dbUsers.secondDriver.token),
                clientSocketCreator("delivery", dbUsers.goodUser.token)
            ]);
            response = await app.post(url).send(payload).set(
                "authorization",
                "Bearer " + dbUsers.firstDriver.token
            );
            assert.equal(response.status, errors.forbiddenAccess.status);
            response = await app.post(url).send(payload).set(
                "authorization",
                "Bearer " + dbUsers.conflictManager.token
            );
            assert.equal(response.status, 200);
            response = await listenEvent({
                close: false,
                name: "new-assignment",
                socket: sockets[0]
            });
            assert.isNotNull(response);
            response = await Promise.all([
                listenEvent({name: "room-created", socket: sockets[0]}),
                listenEvent({name: "user-joined-room", socket: sockets[1]})
            ]);
            assert.isTrue(response.every((value) => value !== null));
        });

        it(
            "should notify the manager when a backup finish a delivery",
            async function () {
                let response;
                let manager = await clientSocketCreator(
                    "conflict",
                    dbUsers.conflictManager.token
                );
                conflict.assigneeId = dbUsers.secondDriver.id;
                conflict.assignerId = dbUsers.conflictManager.id;
                await conflict.save();
                testDeliveries[2].status = deliveryStatuses.inConflict;
                await testDeliveries[2].save();
                response = await app.post(
                    "/delivery/conflict/verify-code"
                ).send({
                    code: testDeliveries[2].code,
                    id: testDeliveries[2].id
                }).set("authorization", "Bearer " + dbUsers.secondDriver.token);
                assert.equal(response.status, 200);
                response = await listenEvent({
                    name: "conflict-solved",
                    socket: manager
                });
                assert.equal(response, conflict.id);
            }
        );
        it("should enable a manager to archive a conflict", async function () {
            const url = "/delivery/conflict/archive";
            let response;
            const data = {id: conflict.id};
            const client = await clientSocketCreator(
                "delivery",
                dbUsers.goodUser.token
            );
            response = await postData({
                app,
                data,
                token: dbUsers.conflictManager.token,
                url
            });
            assert.equal(response.status, 200);
            response = await listenEvent({
                name: "delivery-archived",
                socket: client
            });
            assert.equal(response.id, testDeliveries[2].id);
        });
    });
});
