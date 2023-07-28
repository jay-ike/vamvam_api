/*jslint
node
*/
const express = require("express");
const getUserModule = require("../modules/user.module");
const {protectRoute} = require("../utils/middlewares");
const {errorHandler} = require("../utils/helpers");
const {
    avatarValidator,
    carInfosValidator,
    hashedUploadHandler
} = require("../utils/upload");
const fieldsOptions = {
    "avatar": {
        folderPath: "public/uploads/",
        validator: avatarValidator
    },
    "carInfos": {
        folderPath: "public/uploads/",
        validator: carInfosValidator
    }
};
function getUserRouter(userModule) {
    const routerModule = userModule || getUserModule({});
    const router = new express.Router();

    router.get(
        "/infos",
        protectRoute,
        routerModule.ensureUserExists,
        errorHandler(routerModule.getInformations)
    );


    router.post(
        "/delete-avatar",
        protectRoute,
        errorHandler(routerModule.deleteAvatar)
    );
    router.post(
        "/update-profile",
        protectRoute,
        hashedUploadHandler(fieldsOptions).fields([
            {maxCount: 1, name: "avatar"},
            {maxCount: 1, name: "carInfos"}
        ]),
        errorHandler(routerModule.updateProfile)
    );
    return router;
}

module.exports = getUserRouter;