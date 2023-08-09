
const {
    after,
    afterEach,
    before,
    beforeEach,
    describe,
    it
} = require("mocha");
const {assert} = require("chai");
const {Delivery, DeliveryConflict, User, connection} = require("../src/models");
const {
    clientSocketCreator,
    loginUser,
    getToken,
    otpHandler,
    syncUsers,
    users
} = require("./fixtures/users.data");
const {
    deliveries,
    deliveryResquestor,
    missoke,
    setupDeliveryServer
} = require("./fixtures/deliveries.data");
const getSocketManager = require("../src/utils/socket-manager");
const {deliveryStatuses, errors} = require("../src/utils/config");
const {toDbPoint} = require("../src/utils/helpers");

const {
    setupDelivery,
    requestDelivery
} = deliveryResquestor(getToken, Delivery);

describe("delivery side effects test", function () {
    let server;
    let app;
    let dbUsers;
    let socketServer;
    let setupDatas;
    const connectUser = clientSocketCreator("delivery");
    const connectConflictManager = clientSocketCreator("conflict");

    before(function () {
        const tmp = setupDeliveryServer(otpHandler);
        server = tmp.server;
        app = tmp.app;
        socketServer = getSocketManager({
            deliveryModel: Delivery,
            httpServer: server,
            userModel: User
        });
    });

    beforeEach(async function () {
        await connection.sync({force: true});
        dbUsers = await syncUsers(users, User);
        setupDatas = await setupDelivery({
            app,
            clientPhone: dbUsers.goodUser.phone,
            delivery: deliveries[0],
            driverData: dbUsers.firstDriver,
            initialState: deliveryStatuses.started
        });
    });

    afterEach(async function () {
        await connection.drop();
    });

    after(async function () {
        await server.close();
        await socketServer.io.close();
    });
    it("should notify the client on delivery's ending", async function () {
        let data;
        const {driverToken, request} = setupDatas;
        const client = await connectUser(request.token);
        await app.post("/delivery/verify-code").send(request).set(
            "authorization", "Bearer " + driverToken
            );
            data = await new Promise(function (res) {
            client.on("delivery-end", function (data) {
                client.close();
                res(data)
            });
        });
        assert.equal(data.deliveryId, request.id);
    });
    
    it(
        "should notify a client when a driver update his position",
        async function () {
            let data;
            const {driverToken, request} = setupDatas;
            const [{value: client}] = await Promise.allSettled([
                connectUser(request.token),
                connectUser(driverToken).then(function (driver) {
                    driver.emit("new-position", missoke);
                })
            ]);
            data = await new Promise(function (res) {
                client.on("new-position", function (data) {
                    client.close();
                    res(data);
                });
            });
            assert.deepEqual(data, missoke);
            data = await User.findOne({where: {id: dbUsers.firstDriver.id}});
            assert.deepEqual(data.position, {
                type: "Point",
                coordinates: [missoke.latitude, missoke.longitude]
            });
        }
    );
    describe("delivery initialization interactions", function () {
        let request;
        const nearByPoint = {
            latitude: 4.0470347,
            longitude: 9.6971706
        };
        const farPoint = {
            latitude: 3.989972,
            longitude: 9.799537
        };
        beforeEach(async function () {
            request = await requestDelivery({
                app,
                data: deliveries[1],
                phone: dbUsers.goodUser.phone
            });
        });

        function listenEvent({name, socket, timeout = 1500}) {
            return new Promise(function (res, rej) {
                socket.on(name, function (data) {
                    socket.close();
                    res(data);
                });
                setTimeout(function () {
                    socket.close();
                    rej("Timeout exceeded");
                }, timeout);
            });
        }
        function updatePosition(socket, position) {
            return new Promise(function (res) {
                socket.emit("new-position", position);
                socket.on("position-updated", res);
            });
        }
            
        it("should notify a client on driver approval", async function () {
            let data;
            const {driverToken} = setupDatas;
            const client = await connectUser(request.token);
            await app.post("/delivery/accept").send(request).set(
                "authorization", "Bearer " + driverToken
            );
            data = await new Promise(function (res) {
                client.on("delivery-accepted", function (data) {
                    client.close();
                    res(data);
                });
            });
            assert.deepEqual(data, {
                deliveryId: request.id,
                driver: dbUsers.firstDriver.toResponse()
            });
        });
    
        it("should notify a driver on client cancellation", async function () {
            let data;
            const {driverToken} = setupDatas;
            const driverSocket = await connectUser(driverToken);
            await updatePosition(driverSocket, nearByPoint);
            await app.post("/delivery/cancel").send(request).set(
                "authorization", "Bearer " + request.token
            );
            data = await new Promise(function (res) {
                driverSocket.on("delivery-cancelled", function (data) {
                    driverSocket.close();
                    res(data);
                });
            });
            assert.equal(data, request.id);
        });
        it("should notify the client on driver reception", async function () {
            let data;
            const {driverToken} = setupDatas;
            const client = await connectUser(request.token);
            await Delivery.update({
                status: deliveryStatuses.pendingReception,
                driverId: dbUsers.firstDriver.id
            }, {where: {id: request.id}});
            await app.post("/delivery/signal-reception").send(request).set(
                "authorization", "Bearer " + driverToken
            );
            data = await new Promise(function (res) {
                client.on("delivery-recieved", function (data) {
                    client.close();
                    res(data);
                });
            });
            assert.equal(data, request.id);
        });
        it(
            "should notify delivery's begining on client confirmation",
            async function () {
                let data;
                const {driverToken} = setupDatas;
                const client = await connectUser(request.token);
                const driverSocket = await connectUser(driverToken);
                await Delivery.update({
                    driverId: dbUsers.firstDriver.id,
                    status: deliveryStatuses.toBeConfirmed
                }, {where: {id: request.id}});
                await app.post("/delivery/confirm-deposit").send(request).set(
                    "authorization", "Bearer " + request.token
                );
                data = await Promise.all([
                    new Promise(function(res) {
                        client.on("delivery-started", function (data) {
                            client.close();
                            res(data);
                        });
                    }),
                    new Promise(function (res) {
                        driverSocket.on("delivery-started", function (data) {
                            driverSocket.close();
                            res(data);
                        });
                    })
                ]);
                assert.deepEqual(data, new Array(2).fill(request.id));
            }
        );
        it("should notify the nearBy drivers on new delivery", async function () {
           let data;
           let request;
           let delivery;
           let [client, firstDriver, secondDriver] = await Promise.all([
               getToken(app, dbUsers.goodUser.phone),
               getToken(app, dbUsers.firstDriver.phone),
               getToken(app, dbUsers.secondDriver.phone)
            ]);
           [firstDriver, secondDriver] = await Promise.all([
            connectUser(firstDriver),
            connectUser(secondDriver)
           ]);
           await Promise.all([
               updatePosition(firstDriver, nearByPoint),
               updatePosition(secondDriver, farPoint)
            ]);
            request = await app.post("/delivery/request").send(
                deliveries[1]
            ).set("authorization", "Bearer " + client);
            data = await Promise.allSettled([
                listenEvent({
                    name: "new-delivery",
                    socket: firstDriver,
                    timeout: 1500
                }),
                listenEvent({
                    name: "new-delivery",
                    socket: secondDriver,
                    timeout: 1500
                })
            ]);
            delivery = await Delivery.findOne({where: {id: request.body.id}});
            assert.deepEqual(data.map((data) => data.value), [delivery.toResponse(), undefined]);
        });
        
        it("should notify the conflict-manager on conflict", async function () {
            let data;
            const message = {
                lastPosition: missoke,
                reporter: dbUsers.firstDriver.toResponse(),
                type: "Package damaged"
            };
            const {driverToken, request} = await setupDelivery({
                app,
                clientPhone: dbUsers.goodUser.phone,
                delivery: deliveries[0],
                driverData: dbUsers.firstDriver,
                initialState: deliveryStatuses.pendingReception
            });
            let conflictManager = await loginUser(
                app,
                dbUsers.conflictManager.phone,
                "aSimplePass"
            );
            message.delivery = await Delivery.findOne(
                {where: {id: request.id}}
            );
            message.delivery = message.delivery.toResponse();
            conflictManager = await connectConflictManager(conflictManager);
            data = await socketServer.io.fetchSockets();
            await app.post("/delivery/report").send({
                conflictType: message.type,
                id: request.id,
                lastPosition: missoke
            }).set("authorization", "Bearer " + driverToken);
            data = await listenEvent({
                name: "new-conflict",
                socket: conflictManager
            });
            assert.deepEqual(data, message);
        });

        
    it("should notify a driver on new assignment", async function () {
        let response;
        let delivery;
        const token = await loginUser(
            app,
            dbUsers.conflictManager.phone,
            "aSimplePass"
        );
        let secondDriver = await getToken(app, dbUsers.secondDriver.phone);
        const {request, driverToken} = await setupDelivery({
            app,
            clientPhone: dbUsers.goodUser.phone,
            delivery: deliveries[0],
            driverData: dbUsers.firstDriver,
            initialState: deliveryStatuses.started
        });
        const conflict = await DeliveryConflict.create({
            deliveryId: request.id,
            type: "Package damaged",
            lastLocation: toDbPoint(missoke),
        });
        secondDriver = await connectUser(secondDriver);
        const payload = {
            id: conflict.id,
            driverId: dbUsers.secondDriver.id
        };
        response = await app.post("/delivery/assign-driver").send(payload).set(
            "authorization", "Bearer " + driverToken
        );
        assert.equal(response.status, errors.notAuthorized.status);
        response = await app.post("/delivery/assign-driver").send(payload).set(
            "authorization", "Bearer " + token
        );
        assert.equal(response.status, 200);
        response = await listenEvent({
            name: "new-assignment",
            socket: secondDriver
        });
        delivery = await conflict.getDeliveryDetails();
        assert.deepEqual(response, delivery);
    });
    });
});
