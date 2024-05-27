/*jslint
node
*/
const {User} = require("../models");
const {
    generateCode,
    isValidLocation,
    parseParam,
    propertiesPicker,
    ressourcePaginator,
    sendResponse,
    toDbPoint
} = require("../utils/helpers");
const {errors} = require("../utils/system-messages");
const {apiRoles} = require("../utils/config");


function getUserModule({
    model
}) {
    const userModel = model || User;
    const userPagination = ressourcePaginator(userModel.getAll);

    async function deleteAvatar(req, res) {
        let {id, phone} = req.user.token;
        const [updated] = await userModel.update({avatar: null}, {
            individualHooks: true,
            where: {id, phone}
        });
        res.status(200).json({updated: updated > 0});
    }

    async function deleteAccount(req, res) {
        let updated;
        let {id} = req.user.token;
        const code = await generateCode(10);
        const user = await userModel.findOne({where: {id}});
        if (user.email !== null) {
            user.email = user.email.replace("@", "-deleted-" + code + "@");
        }
        user.phone += "-deleted-" + code;
        await user.save();
        updated = await user.destroy();
        res.status(200).json({deleted: updated.isSoftDeleted()});
    }

    function formatResponse({avatar, carInfos, updated, updatedProps}) {
        let response;
        const responsePicker = propertiesPicker(updatedProps);
        const responseFields = userModel.genericProps.filter(
            (value) => value !== "avatar" && value !== "carInfos"
        );
        response = responsePicker(responseFields) || {};
        response.updated = updated;
        if (avatar.length > 0) {
            response.avatar = avatar[0].url;
        }
        if (carInfos.length > 0) {
            response.carInfos = carInfos[0].url;
        }
        return response;
    }

    async function getInformations(req, res) {
        let result;
        const code = await req.userData.getSponsorCode();
        result = req.userData.toResponse();
        result.sponsorCode = code;
        res.status(200).json(result);
    }

    async function getAllUsers(req, res) {
        let results;
        let {maxPageSize, name, role, skip} = req.query;
        const pageToken = req.headers["page-token"];
        const getParams = function (params) {
            const roles = parseParam(role, (val) => apiRoles[val]).filter(
                (val) => val !== undefined
            );
            if (roles.length > 0) {
                params.role = roles;
            }
            params.name = name;
            return params;
        };
        results = await userPagination({
            getParams,
            maxPageSize,
            pageToken,
            skip
        });
        res.status(200).json(results);
    }
    async function getNearByDrivers(req, res) {
        let {
            by,
            from,
            internal = true
        } = req.body;
        let drivers;
        if (!isValidLocation(from)) {
            return sendResponse(res, errors.invalidLocation);
        }
        if (!Number.isFinite(by)) {
            by = userModel.getSettings().search_radius;
        }
        if (typeof userModel.nearTo === "function") {
            drivers = await userModel.nearTo({
                by,
                params: {
                    available: true,
                    internal: Boolean(internal).valueOf(),
                    role: "driver"
                },
                point: toDbPoint(from)
            });
        } else {
            drivers = [];
        }

        res.status(200).send({
            result: drivers.map(function (driver) {
                const result = driver.toResponse();
                result.distance = driver.distance;
                return result;
            })
        });
    }

    async function updateAvailabilty(req, res) {
        let updated;
        const {available} = req.body;
        const {id, phone} = req.user.token;
        [updated] = await userModel.update({available}, {where: {id, phone}});
        res.status(200).json({updated: updated > 0});
    }

    async function updateProfile(req, res) {
        let {id, phone} = req.user.token;
        let {
            avatar = [],
            carInfos = []
        } = req.files || {};
        let updated;
        let updatedProps;
        const pickedProperties = propertiesPicker(req.body);
        if (avatar.length > 0) {
            req.body.avatar = avatar[0].path;
        }

        if (carInfos.length > 0) {
            req.body.carInfos = carInfos[0].path;
        }
        updatedProps = pickedProperties(userModel.genericProps);

        if (updatedProps !== undefined) {
            [updated] = await userModel.update(
                updatedProps,
                {
                    individualHooks: true,
                    where: {id, phone}
                }
            );
            res.status(200).json(formatResponse({
                avatar,
                carInfos,
                updated: updated > 0,
                updatedProps
            }));
            await userModel.handleSponsoringRequest(id, req.body.sponsorCode);
        } else {
            sendResponse(res, errors.invalidUploadValues);
        }
    }

    async function getCountByRole(req, res) {
        let users = await userModel.getRolesCount(req.query ?? {});
        let transactions = await userModel.getTransactionCount(req.query ?? {});
        let deliveries = await userModel.getDeliveriesAnalytics(req.query ?? {});
        res.json({users, transactions, deliveries});
    }

    return Object.freeze({
        deleteAccount,
        deleteAvatar,
        getAllUsers,
        getCountByRole,
        getInformations,
        getNearByDrivers,
        updateAvailabilty,
        updateProfile
    });
}

module.exports = getUserModule;
