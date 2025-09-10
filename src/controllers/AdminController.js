const Pet = require("../models/Pet");
const User = require("../models/User")

exports.dashboard = async (req, res) => {
    try {

        const pet_sitters = await User.countDocuments({ role: "Pet_Sitter" });
        const users = await User.countDocuments({ role: "User" });
        const pets = await Pet.countDocuments();
        const data = {
            "Pet Sitter": pet_sitters, users, pets
        }
        return res.json({ success: 1, data, message: "Dashboard" });
    } catch (err) {
        return res.json({ success: 0, message: err.message })
    }
}