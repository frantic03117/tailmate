const Pet = require("../models/Pet");

/**
 * Create a pet for a user
 * @param {Object} petData - pet payload
 * @param {Array} files - uploaded images
 * @param {ObjectId} userId - owner user id
 * @returns {Promise<Object>} - saved pet
 */
async function createPetForUser(petData, files, userId) {
    if (!userId) {
        return res.status(500).json({ success: 0, message: "User not found" });
    }
    const newPetData = { ...petData, pet_parent: userId };

    // attach images if uploaded
    if (files && files.length > 0) {
        newPetData.pet_images = files.map(file => file.path);
    }

    const pet = new Pet(newPetData);
    return await pet.save();
}

/**
 * Parse JSON if it's a string, otherwise return object
 */
function parseJSON(data) {
    if (!data) return null;
    try {
        return typeof data === "string" ? JSON.parse(data) : data;
    } catch (e) {
        return null;
    }
}
/**
 * Remove specific images from a pet's pet_images array
 * @param {String} petId 
 * @param {Array} imagesToRemove 
 * @returns {Promise<Object>} updated pet
 */
async function removePetImages(petId, imagesToRemove) {
    return await Pet.findByIdAndUpdate(
        petId,
        { $pull: { pet_images: { $in: imagesToRemove } } },
        { new: true }
    );
}

module.exports = {
    createPetForUser,
    parseJSON,
    removePetImages
};
