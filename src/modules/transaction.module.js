/*jslint node*/

const {Bundle, Delivery, Payment, Transaction, User} = require("../models");
const {fn, literal} = require("sequelize");
const {errors} = require("../utils/system-messages");
const {
    bundleStatuses,
    getPaymentConfig,
    staticPaymentProps
} = require("../utils/config");
const {
    getPaymentService,
    paymentManager,
    ressourcePaginator,
    sendResponse
} = require("../utils/helpers");

function getTransactionModule({associatedModels, model, paymentHandling}) {
    const transactionModel = model || Transaction;
    const associations = associatedModels || {Bundle, Delivery, Payment, User};
    const paymentHandler = paymentHandling || paymentManager(
        getPaymentService(associations.Payment)
    );

    associations.Delivery.addEventListener(
        "point-withdrawal-requested",
        withdrawal
    );
    const transactionPagination = ressourcePaginator(transactionModel.getAll);

    async function verifyPaymentData(req, res, next) {
        let pack;
        let payment;
        const config = getPaymentConfig();
        const secretHash = config.secret_hash;
        const signature = req.headers["verif-hash"];
        const {amount, id, status} = req.body.data;
        if (signature !== secretHash && status !== "successful") {
            associations.Delivery.emitEvent("failure-payment", {
                payload: {amount},
                userId: payment.driverId
            });
            return sendResponse(res, errors.notAuthorized);
        }
        payment = await associations.Payment.findOne({
            where: {transId: id}
        });
        if (payment.isVerify) {
            return sendResponse(res, errors.paymentAlreadyVerified);
        }
        res.status(200).send({});
        pack = await associations.Bundle.findOne({
            attributes: [
                "bonus",
                "point",
                "unitPrice",
                [fn("SUM", literal("`point` * `unitPrice`")), "expectedAmount"]
            ],
            where: {id: payment.packId}
        });
        req.payment = payment;
        req.pack = pack;
        next();
    }

    async function ensureBundleExists(req, res, next) {
        let bundle;
        let driver;
        let query;
        const {packId} = req.body;
        const {id} = req.user.token;
        if (typeof packId !== "string" || packId === "") {
            return sendResponse(res, errors.invalidValues);
        }
        query = {
            attributes: [
                [fn("SUM", literal("`point` * `unitPrice`")), "amount"]
            ],
            where: {
                id: packId,
                status: bundleStatuses.activated
            }
        };
        bundle = await associations.Bundle.findOne(query);
        if (bundle === null) {
            return sendResponse(res, errors.notFound);
        }
        driver = await associations.User.findOne({
            attributes: ["id", "firstName", "lastName", "email"],
            where: {id}
        });
        req.bundle = bundle;
        req.driver = driver;
        next();
    }

    async function initTrans(req, res) {
        let payload;
        const {amount} = req.bundle.dataValues;
        const {packId, phoneNumber} = req.body;
        const {
            id: driverId,
            email,
            firstName,
            lastName
        } = req.driver;
        payload = await associations.Bundle.buildBundlePayload(
            {amount, email, firstName, lastName, phoneNumber}
        );
        const {code, init, message} = await paymentHandler.initTransaction(
            payload,
            driverId,
            packId
        );
        if (init === true) {
            res.status(200).send({});
        } else {
            res.status(code).send({message});
        }
    }

    async function finalizePayment(req, res) {
        const {amount, id} = req.body.data;
        const payment = req.payment;
        const {bonus, expectedAmount, point, unitPrice} = req.pack.dataValues;
        const {verifiedTrans} = await paymentHandler.verifyTransaction(
            expectedAmount,
            id
        );
        if (verifiedTrans) {
            await transactionModel.create({
                bonus,
                driverId: payment.driverId,
                point,
                unitPrice
            });
            payment.isVerify = true;
            await payment.save();
            associations.Delivery.emitEvent("successful-payment", {
                payload: {
                    amount: expectedAmount,
                    bonus: bonus * unitPrice,
                    point
                },
                userId: payment.driverId
            });
        } else {
            sendResponse(res, errors.paymentApproveFail);
            associations.Delivery.emitEvent("failure-payment", {
                payload: {amount},
                userId: payment.driverId
            });
        }
    }

    async function withdrawal(data) {
        let {bonus, driverId, point} = data;
        await transactionModel.create({
            bonus,
            driverId,
            point,
            type: staticPaymentProps.debit_type,
            unitPrice: staticPaymentProps.debit_amount
        });
        associations.Delivery.emitEvent("point-withdrawal-fulfill", {
            payload: {
                amount: point * staticPaymentProps.debit_amount,
                bonus,
                point
            },
            userId: driverId
        });
    }

    async function incentiveBonus(req, res) {
        let walletSummer;
        let currentBonus;
        const {bonus, driverId, type} = req.body;
        try {
            if (type === "recharge") {
                if (bonus < 0) {
                    return sendResponse(res, errors.cannotPerformAction);
                }
                await transactionModel.create({
                    bonus,
                    driverId,
                    point: staticPaymentProps.recharge_point,
                    type,
                    unitPrice: staticPaymentProps.debit_amount
                });
                res.status(200).json({});
                associations.Delivery.emitEvent("incentive-bonus", {
                    payload: {
                        amount: bonus * staticPaymentProps.debit_amount,
                        bonus
                    },
                    userId: driverId
                });
            } else {
                walletSummer = await associations.Delivery.getDriverBalance(
                    driverId
                );
                currentBonus = walletSummer.bonus;
                if (bonus > currentBonus) {
                    sendResponse(res, errors.invalidRemove);
                } else {
                    await transactionModel.create({
                        bonus,
                        driverId,
                        point: staticPaymentProps.recharge_point,
                        type,
                        unitPrice: staticPaymentProps.debit_amount
                    });
                    associations.Delivery.emitEvent("bonus-withdrawal", {
                        payload: {
                            amount: bonus * staticPaymentProps.debit_amount,
                            bonus
                        },
                        userId: driverId
                    });
                }
            }
        } catch {
            return sendResponse(res, errors.internalError);
        }
    }

    async function transactionHistory(req, res) {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 8;
        const offset = (page - 1) * limit;
        const {id} = req.user.token;
        const {type} = req.body;
        let {rows} = await transactionModel.getAllByType({
            id,
            limit,
            offset,
            type
        });
        res.status(200).json(rows);
    }

    async function wallet(req, res) {
        let data;
        const {id} = req.user.token;
        data = await associations.Delivery.getDriverBalance(id);
        res.status(200).json({
            wallet: data
        });
    }
    async function rechargeHistory(req, res) {
        let {maxPageSize, skip, type} = req.query;
        let results;
        const pageToken = req.headers["page-token"];
        const getParams = function (params) {
            if (typeof type === "string" && type.length > 0) {
                params.type = type;
            }
            return params;
        };
        results = await transactionPagination({
            getParams,
            maxPageSize,
            pageToken,
            skip
        });
        res.status(200).json(results);
    }

    async function creditSumInfos(ignore, res) {
        try {
            const {
                bonus,
                point,
                solde
            } = await associations.Delivery.getDriverBalance();
            res.status(200).json({
                bonus,
                point,
                solde
            });
        } catch {
            sendResponse(res, errors.internalError);
        }
    }
    return Object.freeze({
        creditSumInfos,
        ensureBundleExists,
        finalizePayment,
        incentiveBonus,
        initTrans,
        rechargeHistory,
        transactionHistory,
        verifyPaymentData,
        wallet
    });
}
module.exports = getTransactionModule;
