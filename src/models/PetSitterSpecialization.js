const { Schema, model } = require("mongoose");
const schema = new Schema({
    pet_sitter: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },
    specialization: {
        type: Schema.Types.ObjectId,
        ref: "Specialization"
    },
    is_active: {
        type: Boolean,
        default: true
    },
    fee: {
        type: Number
    }
}, { timestamps: true });

module.exports = new model('PetSitterSpecialization', schema);