/*jslint
node
*/
"use strict";
const {DataTypes, Sequelize} = require("sequelize");
const {getdbConfig} = require("./config.js");
const {mergableObject} = require("./helpers.js");

function sequelizeConnect({
    database,
    password = null,
    port,
    username
}) {
    let connection = new Sequelize(database, username, password, {
        dialect: "mariadb",
        host: process.env.HOST ?? "127.0.0.1",
        logging: process.env.NODE_ENV !== "test",
        port
    });
    return connection;
}
function uuidType() {
    return {
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        type: DataTypes.UUID
    };
}

function enumType(set, initialValue) {
    let values = set;
    let defaultValue;
    const result = Object.create(mergableObject);
    result.type = DataTypes.ENUM;
    if (!Array.isArray(set)) {
        values = Object.values(set);
    }
    if (typeof initialValue === "string") {
        defaultValue = initialValue;
    }
    return result.with({defaultValue, values});
}

function required(type, nullable = false) {
    const result = Object.create(mergableObject);
    return result.with({
        allowNull: nullable,
        type: type ?? DataTypes.GEOMETRY("POINT")
    });
}

module.exports = Object.freeze({
    enumType,
    required,
    sequelizeConnection: (config = getdbConfig()) => sequelizeConnect(config),
    uuidType
});
