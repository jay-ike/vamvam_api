/*jslint
node
*/
const express = require("express");
const getRegistrationModule = require("../modules/driver.module");
const {errorHandler} = require("../utils/helpers");
const {carInfosValidator, hashedUploadHandler} = require("../utils/upload");
const {allowRoles, protectRoute} = require("../utils/middlewares");
const {
    availableRoles: roles
} = require("../utils/config");

const fieldsOptions = {
    "carInfos": {
        folderPath: "public/registrations/",
        validator: carInfosValidator
    }
};

function buildRegistrationRoutes(module) {
    const routeModule = module || getRegistrationModule({});
    const router = new express.Router();
    router.post(
        "/register",
        hashedUploadHandler(fieldsOptions).single("carInfos"),
        routeModule.ensureUnregistered,
        routeModule.ensureValidDatas,
        errorHandler(routeModule.registerDriver)
    );
    router.post(
        "/register-intern",
        protectRoute,
        allowRoles([roles.registrationManager]),
        hashedUploadHandler(fieldsOptions).single("carInfos"),
        routeModule.ensureValidDatas,
        routeModule.ensureUserNotExists,
        errorHandler(routeModule.registerIntern)
    );
    router.post(
        "/update-registration",
        protectRoute,
        allowRoles([roles.registrationManager]),
        hashedUploadHandler(fieldsOptions).single("carInfos"),
        routeModule.ensureRegistrationExists,
        routeModule.ensureIsGranted,
        errorHandler(routeModule.updateRegistration)
    );
    router.post(
        "/validate-registration",
        protectRoute,
        allowRoles([roles.registrationManager]),
        routeModule.ensureRegistrationExists,
        routeModule.ensureIsGranted,
        errorHandler(routeModule.validateRegistration)
    );
    router.post(
        "/reject-validation",
        protectRoute,
        allowRoles([roles.registrationManager]),
        routeModule.ensureRegistrationExists,
        routeModule.ensureIsGranted,
        routeModule.ensureRegistrationPending,
        errorHandler(routeModule.rejectRegistration)
    );
    return router;
}

module.exports = buildRegistrationRoutes;