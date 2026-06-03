
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
const {Delivery, Message, Room, User, connection} = require("../src/models");
const {
  clientSocketCreator,
  generateToken,
  listenEvent,
  messages,
  otpHandler,
  postData,
  setupServer,
  syncUsers,
  users
} = require("./fixtures/helper");
const {toDbPoint} = require("../src/utils/helpers");
const {deliveries} = require("./fixtures/deliveries.data");
const getSocketManager = require("../src/utils/socket-manager");
const getDeliveryHandler = require("../src/modules/delivery.socket-handler");

describe("Message test", function () {
  let server;
  let app;
  let dbUsers;
  let tokens;
  let room;

  before(async function () {
    const tmp = setupServer(otpHandler);
    server = tmp.server;
    app = tmp.app;
    socketServer = getSocketManager({
        deliveryHandler: getDeliveryHandler(Delivery),
        httpServer: server
    });
  });

  beforeEach(async function () {
    let delivery = Object.create(null);
    Object.assign(delivery, deliveries[0]);
    delivery.departure = toDbPoint(deliveries[0].departure);
    delivery.destination = toDbPoint(deliveries[0].destination);
    delivery.deliveryMeta = {
      departureAddress: deliveries[0].departure.address,
      destinationAddress: deliveries[0].destination.address
    };
    await connection.sync({force: true});
    dbUsers = await syncUsers(users, User);
    delivery.clientId = dbUsers.goodUser.id;
    delivery.driverId = dbUsers.firstDriver.id;
    delivery = await Delivery.create(delivery);
    room = await Room.create({
      name: "Livraison pour bonandjo",
      deliveryId: delivery.id
    });
    await room.setUsers([dbUsers.firstDriver, dbUsers.goodUser]);
    tokens = [
      generateToken(dbUsers.goodUser),
      generateToken(dbUsers.firstDriver)
    ];
    messages[0].roomId = room.id;
    messages[1].roomId = room.id;
    await Message.bulkCreate([
      {
        content: messages[0].content,
        senderId: dbUsers.firstDriver.id,
        roomId: room.id,
      },
      {
        content: messages[1].content,
        senderId: dbUsers.goodUser.id,
        roomId: room.id,
      }
    ]);
  });

  afterEach(async function () {
    await connection.drop();
  });

  after(function () {
    socketServer.close();
    server.close();
  });
  it("should return Room Messages", async function () {
    let response = await app
    .get("/discussion/messages")
    .send({roomId: room.id})
    .set("authorization", "Bearer " + tokens[1]);
    assert.equal(response.body.results.length, 2)
  });
  it("should provide user missed messages on connection", async function () {
    let data;
    let client;
    const driverMessage = Object.create(null);
    Object.assign(driverMessage, messages[0]);
    driverMessage.senderId = dbUsers.firstDriver.id;
    await Message.create(driverMessage);
    client = await clientSocketCreator("delivery", tokens[0]);
    data = await listenEvent({name: "new-missed-messages", socket: client});
/*this assertion is made this way to avoid false negative introduced by date comparison*/
    assert.isTrue(data.roomId === room.id && data.messages.length === 2);
  });
  it("should enable to mark a message as read", async function () {
    let data;
    let client;
    let message = Object.create(null);
    Object.assign(message, messages[0]);
    message.senderId = dbUsers.firstDriver.id;
    message = await Message.create(message);
    client = await clientSocketCreator("delivery", tokens[0]);
    client.emit("messages-read", [message.id]);
    await listenEvent({name: "messages-marked-as-read", socket: client});
    data = await Message.findOne({where: {id: message.id}});
    assert.isNotNull(data);
  });
  it(
    "should notify a user on a new message in a discussion",
    async function () {
      let data;
      let response;
      let [client, driver] = await Promise.all([
        clientSocketCreator("delivery", tokens[0]),
        clientSocketCreator("delivery", tokens[1])
      ]);
      response = await postData({
        app,
        data: messages[1],
        token: tokens[1],
        url: "/discussion/new-message"
      });
      data = await Promise.allSettled([
        listenEvent({name: "new-message", socket: client}),
        listenEvent({name: "new-message", socket: driver})
      ]);
      assert.isTrue(data[0].value?.id === response.body.id);
      assert.isTrue(data[1].value?.id === undefined);
    }
  );
  it("should return user rooms with last message", async function () {
    let lastMessage;
    let response;
    lastMessage = await new Promise(function (res) {
      setTimeout(function () {
        res(Message.create({
          content: messages[2].content,
          senderId: dbUsers.firstDriver.id,
          roomId: room.id,
        }));
      }, 1000);
    });
    response = await app
      .get("/discussion/all")
      .set("authorization", "Bearer " + tokens[0]);
    assert.equal(response.body.rooms[0].lastMessage.id, lastMessage.id);
  });
});
