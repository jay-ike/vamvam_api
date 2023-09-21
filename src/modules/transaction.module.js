const { Transaction, Payment, Bundle, Delivery, User } = require("../models");
const {fn, literal} = require("sequelize");
const {errors} = require("../utils/system-messages");
const {
  staticPaymentProps,
  getPaymentConfig
} = require("../utils/config");
const {
  sendResponse,
  getPaymentService,
  paymentManager,
} = require("../utils/helpers");

function getTransactionModule({
  modelTrans,
  modelPay,
  modelBundle,
  deliveryModel,
  paymentHan,
  modelUser,
}) {
  const transactionModel = modelTrans || Transaction;
  const paymentModel = modelPay || Payment;
  const bundleModel = modelBundle || Bundle;
  const deliveriesModel = deliveryModel || Delivery;
  const userModel = modelUser || User;
  const paymentHandler =
    paymentHan || paymentManager(getPaymentService(paymentModel));

  deliveriesModel.addEventListener("point-withdrawal-requested", withdrawal);

  async function verifyPaymentData(req, res, next) {
    let pack;
    let payment;
    const config = getPaymentConfig();
    const secretHash = config.secret_hash;
    const signature = req.headers["verif-hash"];
    const { status, id, amount } = req.body.data;
    if (signature !== secretHash && status !== "successful") {
      deliveriesModel.emitEvent("failure-payment", {
        payload:{
          amount: amount
        },
        userId: payment.driverId,
      });
      return sendResponse(res, errors.notAuthorized);
    }
    payment = await paymentModel.findOne({
      where: {
        transId: id
      },
    });
    if (payment.isVerify){
      return sendResponse(res, errors.paymentAlreadyVerified)
    }
    pack = await bundleModel.findOne({
      attributes: [
        "bonus",
        "point",
        "unitPrice",
        [fn("SUM", literal("`point` * `unitPrice`" )), "expectedAmount"]
      ],
      where: {
        id: payment.packId
      },
    });
    req.payment = payment;
    req.pack = pack;
    next()
  }

  async function ensureBundleExists(req, res, next) {
    let bundle;
    let driver;
    let query;
    const { packId } = req.body;
    const {id} = req.user.token;
    if (typeof packId !== "string" || packId === "") {
      return sendResponse(res, errors.invalidValues);
    }
    query = {
      attributes: [
        [fn("SUM", literal("`point` * `unitPrice`" )), "amount"]
    ],
    where: { id: packId }
    }
    bundle = await bundleModel.findOne(query);
    if (bundle === null) {
      return sendResponse(res, errors.notFound);
    }
    driver = await userModel.findOne({
      where: { id: id },
      attributes: ["id", "firstName", "lastName", "email"],
    });
    req.bundle = bundle;
    req.driver = driver;
    next()
  }

  async function initTrans(req, res) {
    let payload;
    const {amount} = req.bundle.dataValues;
    const {phoneNumber, packId} = req.body;
    const {id: driverId, lastName, firstName, email} = req.driver;
    payload = await bundleModel.buildBundlePayload({amount, phoneNumber, lastName, firstName, email});
    const {init, code, message} = await paymentHandler.initTransaction(
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
    const {id, amount} = req.body.data;
    const payment = req.payment;
    const {bonus, point, unitPrice, expectedAmount} = req.pack.dataValues;
    const {verifiedTrans} = await paymentHandler.verifyTransaction(expectedAmount, id);
    if (verifiedTrans) {
      await transactionModel.create({
        bonus: bonus,
        point: point,
        unitPrice: unitPrice,
        driverId: payment.driverId
      });
      payment.isVerify = true;
      await payment.save();
      res.status(200).json({});
      deliveriesModel.emitEvent("successful-payment", {
        payload: {
          amount: expectedAmount,
          bonus: bonus*unitPrice,
          point: point
        },
        userId: payment.driverId
      });
    } else {
      res.status(401).end();
      deliveriesModel.emitEvent("failure-payment", {
        payload: {
          amount: amount
        },
        userId: payment.driverId,
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
    deliveriesModel.emitEvent("point-withdrawal-fulfill", {
      payload: {
        amount: point * staticPaymentProps.debit_amount,
        bonus,
        point
      },
      userId: driverId
    });
  }

  async function incentiveBonus(req, res){
    const {bonus, driverId, type} = req.body;
    try {
      await transactionModel.create({
        bonus,
        driverId,
        point: staticPaymentProps.recharge_point,
        type: type,
        unitPrice: staticPaymentProps.debit_amount
    });
    res.status(200).json({});
    if( type === "recharge"){
      deliveriesModel.emitEvent("incentive-bonus", {
        payload: {
          amount: bonus * staticPaymentProps.debit_amount,
          bonus
        },
        userId: driverId
      });
    } else {
      deliveriesModel.emitEvent("bonus-withdrawal", {
        payload: {
          amount: bonus * staticPaymentProps.debit_amount,
          bonus
        },
        userId: driverId
      });
    }
    } catch (error) {
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
      limit,
      offset,
      id,
      type,
    });
    res.status(200).json(rows);
  }

  async function wallet(req, res) {
    let data;
    const { id } = req.user.token;
    data = await transactionModel.getDriverBalance(id);
    res.status(200).json({
      wallet: data
    });
  }

  async function rechargeHistory(req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const offset = (page - 1) * limit;
    try {
      const { startDate, endDate, type } = req.body;
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      const { rows, count } = await transactionModel.getAllByTime({
        limit,
        offset,
        start,
        end,
        type,
      });
      res.status(200).json({
        data: rows,
        total: count,
      });
    } catch (error) {
      sendResponse(res, errors.internalError);
    }
  }

  async function creditSumInfos(req, res) {
    try {
      const {point, bonus, solde} = await transactionModel.getDriverBalance();
      res.status(200).json({
        bonus,
        point,
        solde
      });
    } catch (error) {
      sendResponse(res, errors.internalError);
    }
  }
  return Object.freeze({
    verifyPaymentData,
    creditSumInfos,
    ensureBundleExists,
    finalizePayment,
    initTrans,
    transactionHistory,
    incentiveBonus,
    rechargeHistory,
    wallet
  });
}
module.exports = getTransactionModule;
