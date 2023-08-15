/*jslint
node, nomen
*/
const { DataTypes } = require("sequelize");
const { CustomEmitter } = require("../utils/helpers");

function defineMessageModel(connection) {
  const emitter = new CustomEmitter();
  const schema = {
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID,
    },
    reader: DataTypes.JSON,
    content: DataTypes.STRING
  };
  const message = connection.define("Message", schema);
  message.addEventListener = function(eventName, func){
    emitter.on(eventName, func);
  };
  message.emitEvent = function(eventName, func){
    emitter.emit(eventName, func);
  };
  return message;
}
module.exports = defineMessageModel;