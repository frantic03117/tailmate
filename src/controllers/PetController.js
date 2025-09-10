const Pet = require("../models/Pet");


const validatePetData = (data) => {
    const errors = [];

    if (!data.name || data.name.trim() === "") errors.push("Name is required");
    if (!data.type || data.type.trim() === "") errors.push("Type is required");
    if (!data.age && data.age !== 0) errors.push("Age is required");
    if (data.age < 0) errors.push("Age cannot be negative");
    if (data.weight && data.weight < 0) errors.push("Weight cannot be negative");
    // if (data.friendlyWithKids !== undefined && typeof data.friendlyWithKids !== "boolean")
    //     errors.push("friendlyWithKids must be a boolean");

    return errors;
};

// Create a new pet
exports.createPet = async (req, res) => {
    try {
        const errors = validatePetData(req.body);
        if (errors.length > 0) return res.status(400).json({ errors });
        const petData = { ...req.body }
        if (req.files && req.files.length > 0) {
            petData.pet_images = req.files.map(file => file.path); // store file paths
        }

        const pet = new Pet(petData);

        const savedPet = await pet.save();
        res.status(201).json({ data: savedPet, success: 1, message: "Creted successfully" });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.updatePet = async (req, res) => {
    try {
        const errors = validatePetData(req.body);
        if (errors.length > 0) return res.status(400).json({ errors });
        const petData = { ...req.body }
        if (req.files && req.files.length > 0) {
            petData.pet_images = req.files.map(file => file.path); // store file paths
        }
        const updatedPet = await Pet.findByIdAndUpdate(req.params.id, petData, { new: true });
        if (!updatedPet) return res.status(404).json({ success: 0, message: "Pet not found" });
        res.status(200).json({ data: updatedPet, success: 1, message: "updated successfully" });
    } catch (error) {
        res.status(400).json({ success: 0, message: error.message });
    }
};
exports.deletePet = async (req, res) => {
    try {
        const deletedPet = await Pet.findByIdAndDelete(req.params.id);
        if (!deletedPet) return res.status(404).json({ message: "Pet not found" });
        res.status(200).json({ message: "Pet deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getAllPets = async (req, res) => {
    try {
        const { pet_parent, name, breed, gender, type } = req.query;
        let fdata = {};
        if (pet_parent) {
            fdata['pet_parent'] = pet_parent;
        }
        if (name) {
            fdata['name'] = { $regex: name, $options: "i" };
        }
        if (breed) {
            fdata['breed'] = { $regex: breed, $options: "i" };
        }
        if (gender) {
            fdata['gender'] = { $regex: gender, $options: "i" };
        }
        if (type) {
            fdata['type'] = type;
        }
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Fetch total count for pagination info
        const total = await Pet.countDocuments();

        // Fetch pets with pagination
        const pets = await Pet.find(fdata).populate('pet_parent').populate('type').skip(skip).limit(limit);

        res.status(200).json({
            pagination: {
                total,
                page,
                totalPages: Math.ceil(total / limit),
                limit,
            },
            data: pets,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

