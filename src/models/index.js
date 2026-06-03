/*jslint node*/
const {Op, col, fn, literal, where} = require("sequelize");
const {sequelizeConnection} = require("../utils/db-connector.js");
const {availableRoles} = require("../utils/config.js");
const {formatDbPoint, pathToURL} = require("../utils/helpers.js");
const connection = sequelizeConnection();
const User = require("./user.js")(connection);
const otpRequest = require("./otp_request.js")(connection);
const {conflict, delivery} = require("./delivery.js")(connection, User);
const Bundle = require("./bundle.js")(connection);
const Trans = require("./transaction.js")(connection);
const Payment = require("./payment.js")(connection);
const Registration = require("./driver-registration.js")(connection, User);
const roomModels = require("./room.model.js")(connection, User, delivery);
const Blacklist = require("./blacklist.js")(connection, User);
const Settings = require("./settings.js")(connection);
const {Sponsor, Sponsorship} = require("./sponsor.js")(connection, User);
const {buildClause, buildPeriodQuery, paginationQuery} = require("./helper");
const order = [["createdAt", "DESC"]];

Bundle.hasOne(Payment, {
    as: "Pack",
    constraints: false,
    foreignKey: "packId"
});
User.hasOne(Payment, {
    as: "Driver",
    constraints: false,
    foreignKey: "driverId"
});
Trans.belongsTo(User, {
    as: "Driver",
    constraints: false,
    foreignKey: "driverId"
});

Settings.addEventListener("settings-update", function (data) {
    if (data.type === "delivery") {
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
    let query = paginationQuery(offset, maxSize);
    let results;
    let formerLastId;
    if (typeof type === "string") {
        query.where = {type};
    }
    query.paranoid = false;
    query.include = [
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
        } = row.Driver;
        return Object.freeze({
            amount: point * unitPrice,
            avatar,
            bonus,
            date,
            firstName,
            lastName,
            point
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
Trans.getAllByTime = async function ({limit, offset, type}) {
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
        order
    };
    if (type !== null && type !== undefined) {
        query.where = {type};
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
        } = row.Driver;
        return Object.freeze({
            amount: point * unitPrice,
            avatar,
            bonus,
            date,
            firstName,
            lastName,
            point
        });
    });
    return result;
};

async function transactionSummary({fieldMap = {}, from, id, to}) {
    let query;
    let results;
    const defautResult = {};
    defautResult[fieldMap.point ?? "point"] = 0;
    defautResult[fieldMap.solde ?? "solde"] = 0;
    defautResult[fieldMap.bonus ?? "bonus"] = 0;

    query = {
        attributes: [
            [fn("SUM", fn(
                "IF",
                literal("`type`='recharge'"),
                col("point"),
                literal("-1 * `point`")
            )), fieldMap.point ?? "point"],
            [fn("SUM", fn(
                "IF",
                literal("`type`='recharge'"),
                literal("`point` * `unitPrice`"),
                literal("-1 * `point` * `unitPrice`")
            )), fieldMap.solde ?? "solde"],
            [fn("SUM", fn(
                "IF",
                literal("`type`='recharge'"),
                col("bonus"),
                literal("-1 * `bonus`")
            )), fieldMap.bonus ?? "bonus"]
        ],
        where: buildClause(Op.and, buildPeriodQuery(from, to))
    };
    if (id !== null && id !== undefined) {
        query.where.driverId = id;
    }
    results = await Trans.findAll(query);
    return results[0]?.dataValues ?? defautResult;
}

User.getAll = async function ({
    maxSize = 10,
    name,
    offset = 0,
    role
}) {
    let query = paginationQuery(offset, maxSize);
    let results;
    let formerLastId;
    const forbiden = ["deviceToken", "password", "id", "createdAt", "updatedAt"];
    query.clauses = [];
    query.roles = role ?? Object.values(availableRoles);
    query.props = Object.keys(User.getAttributes()).filter(
        (key) => !forbiden.includes(key)
    ).concat([
        `${User.getTableName()}.id`,
        `${User.getTableName()}.createdAt as createdAt`,
        "sum(if(`type`='recharge', `point`, -1*`point`)) as point",
        "sum(if(`type`='recharge', `bonus`, -1*`bonus`)) as bonus",
        "sum(if(`type`='recharge', `point`*`unitPrice`, " +
            "-1*`point`*`unitPrice`)) as solde"
    ]);
    query.clauses.push(`\`role\` in (${query.roles.filter(
        (v) => v !== availableRoles.adminRole
    ).map((role) => `'${role}'`).join(",")})`);
    if (typeof name === "string") {
        query.clauses.push(
            `concat(\`firstName\`, ' ', \`lastName\`) like '%${name}%' `
        );
    }
    query.sql = `select ${query.props.join(", ")}
        from ${User.getTableName()} left join ${Trans.getTableName()}
        on ${User.getTableName()}.id = ${Trans.getTableName()}.driverId
        where (${query.clauses.join(" and ")})
        group by ${User.getTableName()}.id
        limit ${query.offset}, ${query.limit}
    `;

    results = await connection.query(query.sql, {
        type: connection.QueryTypes.SELECT
    });
    results = results.map(function (result) {
        const clone = Object.assign({}, result);
        clone.position = formatDbPoint(clone.position);
        if (clone.avatar !== null && clone.avatar !== undefined) {
            clone.avatar = pathToURL(clone.avatar);
        }
        if (clone.carInfos !== null && clone.carInfos !== undefined) {
            clone.carInfos = pathToURL(clone.carInfos);
        }
        if (clone.deletedAt !== null) {
            clone.deleted = true;
        }

        if (clone.role === availableRoles.driverRole) {
            clone.bonus = result.bonus ?? 0;
            clone.point = result.point ?? 0;
            clone.solde = result.solde ?? 0;
        } else {
            delete clone.carInfos;
            delete clone.position;
            delete clone.available;
            delete clone.bonus;
            delete clone.point;
            delete clone.solde;
        }

        return clone;
    });
    if (offset > 0) {
        formerLastId = results.shift();
        formerLastId = formerLastId?.id;
    }
    return {
        formerLastId,
        lastId: results.at(-1)?.id,
        values: results
    };
};

User.getTransactionCount = (from, to) => transactionSummary({
    fieldMap: {solde: "total"},
    from,
    to
});
delivery.getDriverBalance = async function (id) {
    const balance = await transactionSummary({id});
    balance.hasCredit = balance.bonus >= 1 || balance.point >= 1;
    return balance;
};
module.exports = Object.freeze({
    Blacklist,
    Bundle,
    Delivery: delivery,
    DeliveryConflict: conflict,
    Message: roomModels.message,
    Payment,
    Registration,
    Room: roomModels.room,
    Settings,
    Sponsor,
    Sponsorship,
    Transaction: Trans,
    User,
    UserRoom: roomModels.userJoin,
    connection,
    otpRequest
});
