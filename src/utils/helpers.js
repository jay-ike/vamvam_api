/*jslint
node, this
*/
"use strict";
const {EventEmitter} = require("node:events");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {errors} = require("../utils/system-messages");
const {
    getFirebaseConfig,
    getOTPConfig,
    getPaymentConfig
} = require("../utils/config");
const {ValidationError} = require("sequelize");
const CustomEmitter = function (name) {
    const self = this;
    this.name = name;
    this.decorate = function (obj) {
        obj.emitEvent = function (name, data) {
            self.emit(name, data);
        };
        obj.addEventListener = function (name, func) {
            self.on(name, func);
        };
        obj.forward = function (eventName) {
            return {
                to: function (emitter) {
                    obj.addEventListener(eventName, function (data) {
                        if (typeof emitter?.emitEvent === "function") {
                            emitter.emitEvent(eventName, data);
                        }
                    });
                }
            };
        };
    };
};
const {
    TOKEN_EXP: expiration = 3600,
    JWT_SECRET: secret = "test1234butdefault"
} = process.env;
CustomEmitter.prototype = EventEmitter.prototype;

Number.prototype.toRadians = function () {
    return this.valueOf() * (Math.PI / 180);
};

function cloneObject(object) {
    const tmp = Object.create(null);
    Object.assign(tmp, object);
    return tmp;
}

/**this property is added because sequelize uses lodash internally
* to check if an attribute is a plain object and if not it will do this
* { type: attribute } which will raise exception when constructing the sql
*/
const mergableObject = {
    constructor: Object,
    with(opts) {
        const result = this ?? mergableObject;
        if (typeof opts === "object") {
            Object.entries(opts ?? {}).forEach(function ([key, value]) {
                result[key] = value;
            });
        }
        return result;
    }
};

function fileExists(path) {
    if (typeof path === "string") {
        return new Promise(function (res) {
            fs.access(path, fs.constants.F_OK, function (err) {
                if (err) {
                    res(false);
                } else {
                    res(true);
                }
            });
        });
    } else {
        return Promise.resolve(false);
    }
}

function deleteFile(path) {
    if (typeof path === "string") {
        return new Promise(function (res) {
            fs.unlink(path, function (err) {
                if (err) {
                    res(false);
                }
                res(true);
            });
        });
    }
    return Promise.resolve(false);
}

function jwtWrapper(expiresIn = expiration) {
    return {
        sign(payload) {
            return jwt.sign(payload, secret, {expiresIn});
        },
        verify: async function (token) {
            let verifiedToken;
            try {
                verifiedToken = await new Promise(
                    function tokenExecutor(res, rej) {
                        jwt.verify(token, secret, function (err, decoded) {
                            if (decoded === undefined) {
                                rej(err);
                            } else {
                                res(decoded);
                            }
                        });
                    }
                );
                return {token: verifiedToken, valid: true};
            } catch (error) {
                return {errorCode: error.code, valid: false};
            }
        }
    };
}
function sendResponse(res, content, data = {}) {
    res.status(content.status).send({
        data,
        message: content.message
    });
}

function isValidPoint(point) {
    if (point !== null && point !== undefined) {
        return (
            Number.isFinite(point.latitude) &&
            Number.isFinite(point.longitude)
        );
    }
    return false;
}

function toDbPoint(point) {
    return {
        coordinates: [point?.latitude, point?.longitude],
        type: "Point"
    };
}

function toDbLineString(points) {
    let lineString;
    if (Array.isArray(points)) {
        lineString = {type: "LineString"};
        lineString.coordinates = points.map(function (point) {
            if (isValidLocation(point)) {
                return [point.latitude, point.longitude];
            }
            throw new Error("Invalid location !!!");
        });
    }
    return lineString;
}

function formatDbLineString(lineString) {
    let result = null;
    if (lineString !== null && lineString !== undefined) {
        result = lineString.coordinates.map(function ([latitude, longitude]) {
            return Object.freeze({latitude, longitude});
        });
    }
    return result;
}

function formatDbPoint(dbPoint) {
    let result = null;
    if (dbPoint !== null && dbPoint !== undefined) {
        result = {
            latitude: dbPoint.coordinates[0],
            longitude: dbPoint.coordinates[1]
        };
    }
    return result;
}

function isValidLocation(location) {
    let result;
    if (Array.isArray(location)) {
        result = location.every(isValidPoint);
    } else if (location !== null && location !== undefined) {
        result = isValidPoint(location);
    }
    return result;
}

function getFileHash(path) {
    return new Promise(function executor(res, rej) {
        const stream = fs.createReadStream(path);
        const hash = crypto.createHash("sha256");
        stream.on("readable", function () {
            const data = stream.read();
            if (data !== null) {
                hash.update(data);
            } else {
                res(hash.digest("hex"));
                stream.close();
            }
        });
        stream.on("error", function (err) {
            rej(err);
        });
    });
}

async function fetchUrl({
    body,
    headers = {"content-type": "application/json"},
    method = "POST",
    url
}) {
    const {
        default: fetch
    } = await import("node-fetch");
    const options = {headers, method};
    if (body !== null) {
        options.body = JSON.stringify(body);
    }
    return fetch(url, options);
}

function errorHandler(func) {
    return async function handleEndPoint(req, res, next) {
        let err;
        let content;
        try {
            await func(req, res, next);
        } catch (error) {
            console.log(error);
            if (ValidationError.prototype.isPrototypeOf(error)) {
                err = errors.invalidValues;
                content = error.errors.map(function ({message}) {
                    return message.replace(/^\w*\./, "");
                }, {}).join(" and ");
                return sendResponse(res, err, content);
            } else {
                err = errors.internalError;
                return sendResponse(res, err);
            }
        }
    };
}

function propertiesPicker(object) {
    return function (props) {
        let result;
        if (typeof object === "object") {
            result = Object.entries(object).reduce(function (acc, entry) {
                let [key, value] = entry;
                if (
                    props.includes(key)
                    && value !== null
                    && value !== undefined
                ) {
                    acc[key] = value;
                }
                return acc;
            }, Object.create(null));
        }
        if (Object.keys(result || {}).length > 0) {
            return result;
        }
    };
}

function getOTPService(model) {
    const config = getOTPConfig();
    const getTtl = () => model.getSettings().ttl;
    const pinId = "1111";
    async function sendCode({phone, signature, type = "auth"}) {
        let res;
        res = await model.canRequest({phone, ttlInSeconds: getTtl(), type});
        if (!res) {
            res = cloneObject(errors.ttlNotExpired);
            res.sent = false;
            return res;
        }
        await model.upsert({phone, pinId, type}, {fields: ["pinId"]});
        return {pinId, sent: true};
    }

    async function verifyCode({code, phone, type = "auth"}) {
        let res = await model.findOne({where: {phone, type}});
        if (res === null) {
            res = cloneObject(errors.requestOTP);
            res.verified = false;
            return res;
        }
        if (code !== res.pinId) {
            res = cloneObject(errors.invalidCredentials);
            res.verified = false;
            return res;
        } else {
            await model.destroy({where: {phone, type}});
            return {verified: true};
        }
    }
    return Object.freeze({getTtl, sendCode, verifyCode});
}

function ressourcePaginator(getRessources, expiration = 3600000) {
    const tokenManager = jwtWrapper(expiration);
    async function handleInvalidToken({
        getParams,
        maxPageSize,
        refreshed = false
    }) {
        let nextPageToken = null;
        const {lastId, values} = await getRessources(
            getParams({maxSize: maxPageSize, offset: 0})
        );
        if (Array.isArray(values) && values.length > 0) {
            nextPageToken = tokenManager.sign({
                lastId,
                offset: maxPageSize
            });
        }
        return {nextPageToken, refreshed, results: values};
    }
    async function handleValidToken({
        getParams,
        maxPageSize,
        skip,
        tokenDatas = {}
    }) {
        let nextPageToken;
        let offset;
        let results;
        offset = (
            Number.isFinite(skip)
            ? skip
            : tokenDatas.offset
        );
        results = await getRessources(getParams({
            maxSize: maxPageSize,
            offset
        }));
        nextPageToken = (
            results.values.length < maxPageSize
            ? null
            : tokenManager.sign({
                lastId: results.lastId,
                offset: offset + maxPageSize
            })
        );
        if (
            (results.formerLastId !== tokenDatas.lastId) &&
            (nextPageToken !== null) &&
            (!Number.isFinite(skip))
        ) {
            results = await handleInvalidToken({
                getParams,
                maxSize: maxPageSize,
                refreshed: true
            });
        } else {
            results = {
                nextPageToken,
                refreshed: false,
                results: results.values
            };
        }
        return results;
    }

    return async function paginate({
        getParams = cloneObject,
        maxPageSize,
        pageToken,
        skip
    }) {
        let results;
        let datas;
        if (Number.isFinite(skip)) {
            return handleValidToken({
                getParams,
                maxPageSize,
                skip
            });
        }
        try {
            datas = await tokenManager.verify(pageToken);
            if (datas.valid) {
                results = await handleValidToken({
                    getParams,
                    maxPageSize,
                    tokenDatas: datas.token
                });
            } else {
                results = await handleInvalidToken({getParams, maxPageSize});
            }
        } catch (ignore) {
            results = await handleInvalidToken({getParams, maxPageSize});
        }
        return results;
    };
}


function sendCloudMessage({body, meta: data, title, to}) {
    const {headers, url} = getFirebaseConfig();
    const mutable_content = true;
    const notification = {body, mutable_content, title};
    const content = {data, notification, to};
    return fetchUrl({body: content, headers, url});
}
function getPaymentService(paymentModel) {
    async function initTrans(payload, driverId, packId) {
        let response;
        const config = getPaymentConfig();
        try {
            response = await fetchUrl({
                body: payload,
                headers: {
                    Authorization: `Bearer ${config.flw_key}`,
                    "Content-Type": "application/json"
                },
                url: config.url_charge
            });
        } catch (error) {
            response = errors.internalError;
            console.error(error);
            return {
                code: response.status,
                init: false,
                message: response.message
            };
        }
        if (response.ok) {
            response = await response.json();
            response = response.data.id;
            await paymentModel.create({driverId, packId, transId: response});
            return {init: true};
        } else {
            response = await response.json();
            return {
                code: errors.paymentSendingFail.status,
                content: response.message,
                init: false,
                message: errors.paymentSendingFail.message
            };
        }
    }

    async function verifyTrans(expectedAmount, id) {
        let response;
        const config = getPaymentConfig(id);
        response = await fetchUrl({
            headers: {
                Authorization: `Bearer ${config.flw_key}`,
                "Content-Type": "application/json"
            },
            method: "GET",
            url: config.url_verify
        });
        if (response.ok) {
            response = await response.json();
            if (
                response.data.status === "successful" &&
                response.data.amount >= expectedAmount &&
                response.data.currency === config.expect_currency
            ) {
                return {verifiedTrans: true};
            } else {
                return {
                    code: errors.paymentApproveFail.status,
                    message: errors.paymentApproveFail.message,
                    verifiedTrans: false
                };
            }
        } else {
            response = await response.json();
            return {
                code: errors.paymentApproveFail.status,
                message: errors.paymentApproveFail.message,
                verifiedTrans: false
            };
        }
    }
    return Object.freeze({initTrans, verifyTrans});
}
function paymentManager(paymentService) {
    return {
        initTransaction: function (payload, driverId, packId) {
            return paymentService.initTrans(payload, driverId, packId);
        },
        verifyTransaction: function (expectedAmount, id) {
            return paymentService.verifyTrans(expectedAmount, id);
        }
    };
}

function pathToURL(filePath) {
    let rootDir;
    if (typeof filePath === "string" && filePath.length > 0) {
        rootDir = path.normalize(path.dirname(filePath)).split(path.sep).at(-1);
        return "/" + rootDir + "/" + path.basename(filePath);
    }
}
async function generateCode(byteSize = 5) {
    const {
        default: encoder
    } = await import("base32-encode");
    return encoder(crypto.randomBytes(byteSize), "Crockford");
}

function comparePassword(givenPassword, hash) {
    return bcrypt.compare(givenPassword, hash);
}
async function hashPassword(password) {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
}

function distanceBetween(point1) {
    let lat1;
    let long1;
    if (!isValidPoint(point1)) {
        return {and: () => null};
    }
    lat1 = point1.latitude.toRadians();
    long1 = point1.longitude.toRadians();
    return {
        and(point2, radius = 6563e3) {
            let lat2;
            let long2;
            let deltaLat;
            let deltaLong;
            let result;
            let haversine;
            if (!isValidLocation(point2) || !isValidLocation(point1)) {
                return null;
            }
            lat2 = point2.latitude.toRadians();
            long2 = point2.longitude.toRadians();
            deltaLat = lat2 - lat1;
            deltaLong = long2 - long1;
            haversine = (
                Math.pow(Math.sin(deltaLat / 2), 2) +
                Math.cos(lat1) * Math.cos(lat2) *
                Math.pow(Math.sin(deltaLong / 2), 2)
            );
            result = 2 * radius * Math.asin(Math.sqrt(haversine));
            return result;
        }
    };
}
function parseParam(param, fn) {
    let result = param ?? "";
    result = result.split(",");
    if (typeof fn === "function") {
        result = result.map(fn);
    }
    return result;
}

module.exports = Object.freeze({
    CustomEmitter,
    comparePassword,
    deleteFile,
    distanceBetween,
    errorHandler,
    fileExists,
    formatDbLineString,
    formatDbPoint,
    generateCode,
    getFileHash,
    getOTPService,
    getPaymentService,
    hashPassword,
    isValidLocation,
    jwtWrapper,
    mergableObject,
    parseParam,
    pathToURL,
    paymentManager,
    propertiesPicker,
    ressourcePaginator,
    sendCloudMessage,
    sendResponse,
    toDbLineString,
    toDbPoint
});
