/*jslint
node, nomen
*/
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
const {
    User,
    connection,
    otpRequest
} = require("../src/models");
const {availableRoles} = require("../src/utils/config");
const {errors} = require("../src/utils/system-messages");
const {
    pinIds,
    setupServer,
    setupInterceptor,
    subscriber,
    users
} = require("./fixtures/helper");

describe("authentication tests", function () {
    let server;
    let app;
    let driver = {};
    const signature = "1234567890";
    before(function () {
        Object.assign(driver, subscriber);
        let tmp = setupServer();
        server = tmp.server;
        app = tmp.app;
        driver.phone = users.goodUser.phone;
        driver.role = availableRoles.driverRole;
        setupInterceptor();
    });

    beforeEach(async function () {
        await connection.sync({force: true});
        await User.create(
            Object.assign(subscriber, {phone: subscriber.phoneNumber})
        );
        await otpRequest.bulkCreate([
            {phone: users.firstDriver.phone, pinId: pinIds[0], type: "reset"},
            {phone: users.goodUser.phone, pinId: pinIds[1]}
        ]);
    });

    afterEach(async function () {
        await connection.drop();
    });

    after(function () {
        server.close();
    });

    it("should not send OTP if user exists", async function () {
        const data = {
            phoneNumber: subscriber.phoneNumber,
            signature
        };
        const response = await app.post("/auth/send-otp").send(data);
        assert.equal(response.status, errors.existingUser.status);
    });

    it(
        "should not send an otp request before ttl expired",
        async function () {
            let response;
            const data = {
                phoneNumber: users.goodUser.phone,
                signature
            };
            await otpRequest.truncate();
            response = await app.post("/auth/send-otp").send(data);
            assert.equal(response.status, 200);
            response = await app.post("/auth/send-otp").send(data);
            assert.deepEqual(response.status, errors.ttlNotExpired.status);
        }
    );

    it("should not verify a code if it the OTP wasn't sent", async function () {
        let response = await app.post("/auth/verify-otp").send({
            code: "123456",
            phoneNumber: users.badUser.phone
        });
        assert.equal(response.status, errors.requestOTP.status);
    });
    it("should create a new client on verified OTP", async function () {
        let response;
        response = await app.post("/auth/verify-otp").send({
            code: pinIds[1],
            phoneNumber: users.goodUser.phone
        });
        assert.equal(response.status, 200);
        response = await User.findAll({where: {phone: users.goodUser.phone}});
        assert.isTrue(
            response.length === 1 &&
            response[0].role === availableRoles.clientRole
        );
        response = await otpRequest.findOne(
            {where: {phone: users.goodUser.phone}}
        );
        assert.isNull(response);
    });

    it("should reset password with default PIN", async function () {
        const newPassword = "12345934934";
        let response;
        let resetToken;
        response = {status: User.statuses.activated};
        Object.assign(response, driver);
        response.email = "test@foo.com";
        await User.create(response);
        await app.post("/auth/send-reset-otp").send({
            phoneNumber: driver.phone
        });
        response = await app.post("/auth/verify-reset").send({
            code: "1111",
            phoneNumber: driver.phone
        });
        resetToken = response.body.resetToken;
        assert.equal(response.status, 200);
        response = await app.post("/auth/reset-password").send({
            key: "afaketokenwchich-will-fail",
            password: newPassword
        });
        assert.equal(response.status, errors.tokenInvalid.status);
        response = await app.post("/auth/reset-password").send({
            key: resetToken,
            password: newPassword
        });
        assert.equal(response.status, 200);
    });

    it("should allow a user to change password", async function () {
        const newPassword = "a dummy pass 1000";
        let token;
        let response;
        response = {status: User.statuses.activated};
        Object.assign(response, driver);
        response.email = "test@foo.com";
        await User.create(response);
        response = await app.post("/auth/driver/login").send({
            password: driver.password,
            phoneNumber: driver.phone
        });
        assert.equal(response.status, 200);
        token = response.body.token;
        response = await app.post("/auth/change-password").send({
            newPassword,
            oldPassword: "a wrong password"
        }).set("authorization", "Bearer " + token);
        assert.equal(response.status, errors.invalidCredentials.status);
        response = await app.post("/auth/change-password").send({
            newPassword,
            oldPassword: driver.password
        }).set("authorization", "Bearer " + token);
        assert.equal(response.status, 200);
    });
});
