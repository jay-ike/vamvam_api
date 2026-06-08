/*jslint
node
*/
const models = require("../models");
const {availableRoles} = require("../utils/config");
const {hashPassword} = require("../utils/helpers");

const {
    admin_name = "",
    admin_email: email,
    admin_password: password,
    admin_phone: phone
} = process.env;
const queryInterface = models.connection.getQueryInterface();
const forbiddenProps = ["connection", "Settings"];
const tables = Object.entries(models).filter(
    (entry) => forbiddenProps.includes(entry[0])
).map((entry) => entry[1]);
const users = {};
users[availableRoles.clientRole] = {
    firstName: "guest",
    lastName: "client",
    phone: "+237677777777"
};
users[availableRoles.driverRole] = {
    firstName: "guest",
    lastName: "driver",
    phone: "+237699999999"
};
users[availableRoles.registrationManager] = {
    firstName: "Sam",
    lastName: "manager",
    phone: "+237699999990"
};
users[availableRoles.conflictManager] = {
    firstName: "Conrad",
    lastName: "Resolver",
    phone: "+237699999991"
};
users[availableRoles.adminRole] = {email, phone};

async function createTable(model) {
    const tableName = model.getTableName();
    await queryInterface.createTable(tableName, model.getAttributes());
}
async function createTables() {
    await createTable(models.otpRequest);
    await createTable(models.User);
    await createTable(models.Delivery);
    await createTable(models.Room);
    await createTable(models.Message);
    await createTable(models.UserRoom);
    await createTable(models.DeliveryConflict);
    await createTable(models.Registration);
    await createTable(models.Blacklist);
    await createTable(models.Bundle);
    await createTable(models.Payment);
    await createTable(models.Transaction);
    await createTable(models.Sponsor);
    await createTable(models.Sponsorship);
}

function dropTables(models) {
    return Promise.all(models.map(async function tableDropping(model) {
        await queryInterface.dropTable(model.getTableName());
    }));
}
async function createDefaultUsers() {
    const [firstName, lastName] = admin_name.split(" ");
    const guestPassword = await hashPassword("store1234567");
    users[availableRoles.adminRole].firstName = firstName;
    users[availableRoles.adminRole].lastName = lastName;
    users[availableRoles.adminRole].password = await hashPassword(password);
    users[availableRoles.clientRole].password = guestPassword;
    users[availableRoles.driverRole].password = guestPassword;
    users[availableRoles.registrationManager].password = guestPassword;
    users[availableRoles.conflictManager].password = guestPassword;
    await models.User.bulkCreate(Object.entries(users).map(
        function ([key, value]) {
            value.role = key;
            return value;
        }
    ));
}


async function up() {
    await createTables(tables);
    await createDefaultUsers();
}

async function down() {
    await dropTables(tables);
}

module.exports = Object.freeze({down, up});
