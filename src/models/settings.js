/*jslint node */
const {
/*jslint-disable*/
    Op,
/*jslint-enable*/
    DataTypes,
    col,
    fn
} = require("sequelize");
const {dbSettings} = require("../utils/config");
const {CustomEmitter} = require("../utils/helpers");

function jsonObjectMapper(obj) {
    if (typeof obj === "object" && obj !== null) {
        return fn("JSON_OBJECT", ...(Object.entries(obj).reduce(
            function (acc, [key, val]) {
                return acc.concat([key, val]);
            }
        )));
    }
    return null;
}
function parseArrayObject(arr) {
    if (Array.isArray(arr)) {
        return fn(
            "JSON_ARRAY",
            ...(arr.map(jsonObjectMapper).filter((e) => e !== null))
        );
    }
    return arr;
}

function defineSettingsModel(connection) {
    const emitter = new CustomEmitter("Settings Emitter");
    const schema = {
        type: {
            allowNull: false,
            type: DataTypes.STRING,
            unique: true
        },
        value: {
            allowNull: false,
            type: DataTypes.JSON
        }
    };
    const settings = connection.define("setting", schema);
    const allowedSettings = Object.keys(dbSettings);
/*jslint-disable*/
    settings.getAll = async function fetchSettings(type) {
        let results;
        let where = (
            typeof type === "string"
            ? {type}
            : {type: {[Op.in]: allowedSettings}}
        );
        results = await settings.findAll({where});
        return results.map(function resultMapper(setting) {
            const result = Object.create(null);
            Object.assign(result, setting.dataValues);
            result.type = dbSettings[setting.type]?.value;
            result.value = Object.entries(setting.value).reduce(
                function (acc, [key, val]) {
                    acc[dbSettings[setting.type].options[key]] = val;
                    return acc;
                },
                Object.create(null)
            );
            return Object.freeze({
                type: result.type,
                value: result.value
            });
        });
    };
/*jslint-enable*/
    settings.updateSettings = function ({type, value}) {
        const args = Object.entries(value).reduce(
            function (acc, [key, val]) {
                return acc.concat([
                    "$." + key,
                    parseArrayObject(val)
                ]);
            },
            []
        );
        return settings.update({
            value: fn("JSON_SET", col("value"), ...args)
        }, {where: {type}});
    };
    emitter.decorate(settings);
    return settings;
}

module.exports = Object.freeze(defineSettingsModel);
