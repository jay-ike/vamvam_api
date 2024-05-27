/*jslint node*/
const {Op} = require("sequelize");
const {sequelizeConnection} = require("../utils/db-connector.js");
const connection = sequelizeConnection();
const User = require("./user.js")(connection);
const otpRequest = require("./otp_request.js")(connection);
const {delivery, conflict} = require("./delivery.js")(connection, User);
const Bundle = require("./bundle.js")(connection);
const Trans = require("./transaction.js")(connection);
const Payment = require("./payment.js")(connection);
const Registration = require("./driver-registration.js")(connection, User);
const roomModels = require("./room.model.js")(connection, User, delivery);
const Blacklist = require("./blacklist.js")(connection, User);
const Settings = require("./settings.js")(connection);
const {Sponsor, Sponsorship} = require("./sponsor.js")(connection, User);
const types = require("./helper");
const order = [["createdAt", "DESC"]];

Bundle.hasOne(Payment, {
    as: "Pack",
    constraints: false,
    foreignKey: "packId"
})
User.hasOne(Payment, {
    as: "Driver",
    constraints: false,
    foreignKey: "driverId"
})
Trans.belongsTo(User, {
    as: "Driver",
    constraints: false,
    foreignKey: "driverId"
});

Settings.addEventListener("settings-update", function (data) {
    if(data.type === "delivery") {
        delivery.setSettings(data.value);
    }
    if (data.type === "otp") {
        otpRequest.setSettings(data.value);
    }
});
Settings.forward("user-revocation-requested").to(delivery);
Registration.forward("new-registration").to(delivery);

Trans.getAll = async function ({
    maxSize = 10,
    offset = 0,
    type
}) {
    let query = types.paginationQuery(offset, maxSize);
    let results;
    let formerLastId;
    if (typeof type === "string") {
        query.where = {type: type};
    }
    query.paranoid = false;
    query.include =  [
        {
            as: "Driver",
            attributes: ["id", "firstName", "lastName", "avatar"],
            model: User,
            require: true
        }
    ];
    results = await Trans.findAll(query);
    results.rows = results.map(function (row) {
        const {
            bonus,
            createdAt: date,
            point,
            unitPrice
        } = row;
        const {
            avatar,
            firstName,
            lastName
        } = row.Driver
        return Object.freeze({
            amount: point * unitPrice,
            bonus,
            date,
            point,
            avatar,
            firstName,
            lastName
        });
    });
    if (offset > 0) {
        formerLastId = results.shift();
        formerLastId = formerLastId?.id;
    }
    return {
        formerLastId,
        lastId: results.at(-1)?.id,
        values: results.rows
    };
};
Trans.getAllByTime= async function ({limit, offset, type}) {
    let result;
    let query;
    query = {
        include: [
            {
                as: "Driver",
                attributes: ["id", "firstName", "lastName", "avatar"],
                model: User,
                require: true
            }
        ],
        limit,
        offset,
        order,
    }
    if (type !== null && typeof type !== "undefined") {
        query.where = {type: type};
    }
    
    result = await Trans.findAndCountAll(query);
    result.rows = result.rows.map(function (row) {
        const {
            bonus,
            createdAt: date,
            point,
            unitPrice
        } = row;
        const {
            avatar,
            firstName,
            lastName
        } = row.Driver
        return Object.freeze({
            amount: point * unitPrice,
            bonus,
            date,
            point,
            avatar,
            firstName,
            lastName
        });
    });
    return result;
};

delivery.getDriverBalance = Trans.getDriverBalance;
module.exports = Object.freeze({
    Blacklist,
    Bundle,
    Delivery: delivery,
    DeliveryConflict: conflict,
    Message: roomModels.message,
    Registration,
    Room: roomModels.room,
    User,
    Transaction: Trans,
    Payment,
    Settings,
    Sponsor,
    Sponsorship,
    UserRoom: roomModels.userJoin,
    connection,
    otpRequest
});
