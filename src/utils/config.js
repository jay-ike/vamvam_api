/*jslint
node
*/
"use strict";
function settingReducer(acc, [key, setting]) {
    acc[setting.value] = {
        options: Object.entries(setting.options).reduce(function (
            prev,
            [otp_key, opt_value]
        ) {
            prev[opt_value] = otp_key;
            return prev;
        }, Object.create(null)),
        value: key
    };
    return acc;
}
const {env} = process;
const availableRoles = {
    adminRole: "admin",
    clientRole: "client",
    conflictManager: "conflict-manager",
    driverRole: "driver",
    registrationManager: "registration-manager"
};
const apiRoles = {
    client: availableRoles.clientRole,
    conflict: availableRoles.conflictManager,
    driver: availableRoles.driverRole,
    registration: availableRoles.registrationManager
};
const defaultConflicts = [
    {code: "level_1", en: "outage", fr: "panne"},
    {code: "level_2", en: "accident", fr: "accident"},
    {code: "level_3", en: "dispute", fr: "litige"},
    {code: "level_4", en: "assault", fr: "agression"},
    {code: "level_5", en: "non-payment", fr: "défaut de paiement"}
];
const defaultPackageType = [
    {code: "type_1", en: "fragile", fr: "fragile"},
    {code: "type_2", en: "solid", fr: "solide"},
    {code: "type_3", en: "sensitive", fr: "délicat"}
];
const apiSettings = {
    delivery: {
        defaultValues: {
            delivery_conflicts: defaultConflicts,
            delivery_packages: defaultPackageType,
            delivery_ttl: 180,
            driver_search_radius: 5500
        },
        options: {
            conflict_types: "delivery_conflicts",
            package_types: "delivery_packages",
            search_radius: "driver_search_radius",
            ttl: "delivery_ttl"
        },
        value: "delivery-settings"
    },
    otp: {
        defaultValues: {otp_ttl: 180},
        options: {
            ttl: "otp_ttl"
        },
        value: "otp-settings"
    }
};

const responseMessage = {
    successWithdrawal: {
        en: "Successful point removal!",
        fr: "Retrait des points réussi!"
    }
};
const conflictStatuses = Object.freeze({
    cancelled: "cancelled",
    closed: "close",
    opened: "open"
});
const deliveryStatuses = Object.freeze({
    archived: "archived",
    cancelled: "cancelled",
    inConflict: "conflicting",
    initial: "pending-driver-approval",
    pendingReception: "pending-driver-reception",
    started: "started",
    terminated: "terminated",
    toBeConfirmed: "pending-client-approval"
});
const apiDeliveryStatus = Object.freeze({
    archived: deliveryStatuses.archived,
    cancelled: deliveryStatuses.cancelled,
    conflicting: deliveryStatuses.inConflict,
    ongoing: deliveryStatuses.started,
    terminated: deliveryStatuses.terminated
});
const dbStatusMap = Object.entries(apiDeliveryStatus).reduce(
    function (acc, [key, value]) {
        acc[value] = key;
        return acc;
    },
    Object.create(null)
);
const userStatuses = {
    activated: "active",
    inactive: "desactivated",
    pendingValidation: "pending",
    rejected: "rejected"
};
const ages = ["18-24", "25-34", "35-44", "45-54", "55-64", "64+"];
const otpTypes = {
    authentication: "auth",
    reset: "reset"
};

const bundleStatuses = {
    activated: "active",
    inactive: "desactiveted"
};
const staticPaymentProps = {
    country: "CM",
    currency: "XAF",
    debit_amount: 300,
    debit_type: "withdrawal",
    recharge_point: 0,

};
const config = Object.freeze({
    ages,
    apiDeliveryStatus,
    apiRoles: Object.freeze(apiRoles),
    apiSettings: Object.freeze(apiSettings),
    availableRoles: Object.freeze(availableRoles),
    bundleStatuses,
    conflictStatuses,
    dbSettings: Object.freeze(Object.entries(apiSettings).reduce(
        settingReducer,
        Object.create(null)
    )),
    dbStatusMap,
    deliveryStatuses,
    getFirebaseConfig() {
        const {
            fb_serverKey: key,
            msg_url: url
        } = env;
        return Object.freeze({
            headers: {
                Authorization: "key=" + key,
                "content-type": "application/json"
            },
            url
        });
    },
    getOTPConfig() {
        const {otp_key, otp_send, otp_verify} = env;
        return Object.freeze({
            getSendingBody(receiver, signature = "") {
                return {
                    api_key: otp_key,
                    channel: "generic",
                    from: "VAMVAM",
                    message_text: "Your verification code is" +
                    " <vamvam> \n\n" + signature,
                    message_type: "ALPHANUMERIC",
                    pin_attempts: 3,
                    pin_length: 6,
                    pin_placeholder: "<vamvam>",
                    pin_time_to_live: 60,
                    to: receiver
                };
            },
            getVerificationBody: function (pin_id, pin) {
                return {api_key: otp_key, pin, pin_id};
            },
            sent_url: otp_send,
            verify_url: otp_verify
        });
    },
    getPaymentConfig(transactionId) {
        let verify_url;
        const result = Object.create(null);
        verify_url = env.flw_verify_url ?? "";
        verify_url = verify_url.replace("transactionId", transactionId);
        result.expect_currency = env.currency;
        result.flw_key = env.FLW_SECRET_KEY;
        result.secret_hash = env.FLW_SECRET_HASH;
        result.url_charge = env.flw_payment_url;
        result.url_verify = verify_url;
        return Object.freeze(result);
    },
    getdbConfig() {
        const result = Object.create(null);
        result.host="127.0.0.1";
        result.password = env.DB_PASSWORD ? `${env.DB_PASSWORD}` :null;
        result.port = env.db_port;
        result.username = env.DB_USER;
        if (env.NODE_ENV === "development") {
            result.database = env.dev_db;
            return Object.freeze(result);
        }
        if (env.NODE_ENV === "production") {
            result.database = env.production_db;
            return Object.freeze(result);
        }
        result.database = env.test_db;
        console.log(result);
        return Object.freeze(result);
    },
    otpTypes,
    responseMessage: Object.freeze(responseMessage),
    staticPaymentProps,
    tokenTtl: env.TOKEN_EXP,
    userStatuses
});
module.exports = config;
