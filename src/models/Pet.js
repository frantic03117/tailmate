const { Schema, default: mongoose, model } = require("mongoose");

const petSchema = new mongoose.Schema({
    pet_parent: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },
    name: { type: String, },
    type: { type: String, },
    breed: { type: String },
    age: { type: Number },
    age_unit: {
        type: String,
        enum: ['Days', 'Months', 'Years'],
        default: "Months"
    },
    weight: { type: Number },
    about_pet: { type: String },
    friendlyWithKids: { type: String, default: "No" },
    favorites: { type: [String] },
    careInstructions: { type: String },
    vaccinated: { type: Boolean, default: false },
    neutered: { type: Boolean, default: false },
    pet_images: {
        type: [String]
    }

}, { timestamps: true });

module.exports = new model('Pet', petSchema);
