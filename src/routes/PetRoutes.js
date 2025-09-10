const { Router } = require("express");
const { createPet, getAllPets, updatePet, deletePet } = require("../controllers/PetController");
const store = require("../middleware/Upload");
const { Auth } = require("../middleware/Auth");


const router = Router();

// Upload multiple images (max 5)
router.post("/", Auth, store.array('pet_images', 10), createPet);
router.get("/", Auth, getAllPets);

router.put("/:id", Auth, store.array("pet_images", 10), updatePet); // Optional: update images
router.delete("/:id", Auth, deletePet);

module.exports = router;
