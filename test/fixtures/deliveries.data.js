require("dotenv").config();
const supertest = require("supertest");
const {buildServer} = require("../../src");
const deliveryModule = require("../../src/modules/delivery.module");
const buildDeliveryRoutes = require("../../src/routes/delivery.route");
const buildRouter = require("../../src/routes");
const buildAuthRoutes = require("../../src/routes/auth.route");
const getAuthModule = require("../../src/modules/auth.module");

const deliveries = [
    {
        departure: {
            address: "Aphrodite Bonamoussadi",
            latitude: 4.0921257,
            longitude: 9.74284
        },
        destination: {
            address: "Nouvelle route Bonabassem",
            latitude: 4.0731928,
            longitude: 9.7133626
        },
        recipientInfos: {
            name: "Kamga Nouhou",
            phone: "+29820923023209932023",
            otherPhones: ["+4399903940380", "+4309504i900054905"]
        }
    },
    {
        departure: {
            address: "Cathédrale St Pierre et Paul de Bonadibong",
            latitude: 4.0470347,
            longitude: 9.6971706
        },
        destination: {
            address: "Tradex Rhône Poulenc, Douala",
            latitude: 4.0861186,
            longitude: 9.7578306
        },
        recipientInfos: {
            name: "Kam Massock",
            phone: "+298209230988045023",
            otherPhones: ["+23489489440380", "+430757848745934905"]
        }
    },
    {
        departure: {
            address: "Carrefour Logbessou",
            latitude: 4.0845127,
            longitude: 9.7806557
        },
        destination: {
            address: "Tribunal de premiere instance de bonaberi",
            latitude: 4.070708,
            longitude: 9.683527
        },
        recipientInfos: {
            name: "Mbouta Mbezoa",
            phone: "+273873489283203",
            otherPhones: ["+7838349834940380", "+08308934900054905"]
        }
    },
];

const badDelevery = {
    departure: {
        address: "Carrefour Logbessou",
        latitude: {a: 3},
        longitude: 9.7806557
    },
    destination: {
        address: "Tribunal de premiere instance de bonaberi",
        latitude: "testerw",
        longitude: 9.683527
    },
    recipientInfos: {
        name: "Mbouta Mbezoa",
        phone: "+273873489283203",
        otherPhones: ["+7838349834940380", "+08308934900054905"]
    }
};

const missoke = {latitude: 4.056436, longitude: 9.738848};
const positions = [
    {latitude: 4.063221, longitude: 9.733699},
    {latitude: 4.063414, longitude: 9.733162},
    {latitude: 4.063050, longitude: 9.732776}
];

function deliveryResquestor(tokenGetter, model) {

    async function fetchDelivery({app, data, phone, url}) {
        let token = await tokenGetter(app, phone);
        let response = await app.post(url).send(
            data
        ).set("authorization", "Bearer " + token);
        return {response, token};
    }
    async function requestDelivery({
        app,
        data,
        phone
    }) {
        let {response, token} = await fetchDelivery({
            app,
            data,
            phone,
            url: "/delivery/request"
        })
        if (response.body.id !== undefined) {
        await model.update({status: model.statuses.started}, {
                where: {id: response.body.id}
            });
        }
        response.body.token = token;
        response.body.status = response.status;
        return response.body;
    }

    async function setupDelivery({app, clientPhone, delivery, driverData}) {
        const request = await requestDelivery({
            app,
            phone: clientPhone,
            data: delivery
        });
        let token = await tokenGetter(app, driverData.phone);
        await model.update({driverId: driverData.id}, {
            where: {id: request.id}
        });
        return {driverToken: token, request};
    }

    return Object.freeze({requestDelivery, setupDelivery});
}

function setupDeliveryServer(otpHandler) {
    let deliveryRoutes;
    let app;
    let server;
    const authRoutes = buildAuthRoutes(getAuthModule({otpHandler}));
    deliveryRoutes = buildDeliveryRoutes(deliveryModule({}));
    server = buildServer(buildRouter({authRoutes, deliveryRoutes}));
    app = supertest.agent(server);
    return Object.freeze({app, server});
}
module.exports = Object.freeze({
    badDelevery,
    deliveries,
    deliveryResquestor,
    missoke,
    positions,
    setupDeliveryServer
});