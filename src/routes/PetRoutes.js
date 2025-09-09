const { Router } = require("express");
const { createPet, getAllPets, updatePet, deletePet } = require("../controllers/PetController");
const store = require("../middleware/Upload");


const router = Router();

// Upload multiple images (max 5)
router.post("/", store.array('pet_images', 10), createPet);
router.get("/", getAllPets);

router.put("/:id", store.array("pet_images", 10), updatePet); // Optional: update images
router.delete("/:id", deletePet);

module.exports = router;
