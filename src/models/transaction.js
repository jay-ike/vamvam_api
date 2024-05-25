const {DataTypes} = require("sequelize");
const {col, fn, literal} = require("sequelize");

function defineTransaction (connection) {
    const schema = {
        type: {
            type: DataTypes.ENUM,
            defaultValue: "recharge",
            values: ["recharge", "withdrawal"]
        },
        point: {
            type: DataTypes.DOUBLE,
            allowNull: false
        },
        bonus: {
            type: DataTypes.DOUBLE,
            allowNull: false
        },
        unitPrice: {
            type: DataTypes.DOUBLE,
            allowNull: false
        },
        id: {
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            type: DataTypes.UUID
        }
    };
    const transaction = connection.define("transaction", schema );
    transaction.getAllByType= async function ({limit, offset, id, type}) {
        const result = await transaction.findAndCountAll({
            limit,
            offset,
            order: [["createdAt", "DESC"]],
            where: {
                driverId: id,
                type: type
            },
        });
        result.rows = result.rows.map(function (row) {
            const {
                bonus,
                createdAt: date,
                point,
                unitPrice
            } = row;
            return Object.freeze({
                amount: point * unitPrice,
                bonus,
                date,
                point
            });
        });
        return result;
    };
    transaction.getDriverBalance = async function balanceCalculator(id) {
        let query;
        let result;
        query = {
            attributes: [
                "type",
                [fn("SUM", col("point")), "totalPoint"],
                [fn("SUM", literal("`point` * `unitPrice`" )), "totalAmount"],
                [fn("SUM", col("bonus")), "totalBonus"],
            ],
            group: ["type"]
        }
             
        result = await transaction.findAll(query);
        result = result.reduce(function (acc, entry) {
            let factor;
            const {type, totalPoint, totalAmount, totalBonus} = entry.dataValues;
            factor = (type === "recharge" ? 1 : -1);
            acc.bonus += factor * totalBonus;
            acc.point += factor * totalPoint;
            acc.solde += factor * totalAmount;
            return acc;
        }, { bonus: 0, point: 0, solde: 0});
        result.hasCredit = result.bonus >= 1 || result.point >= 1;
        return result;
    };
    return transaction;
}

module.exports = defineTransaction;