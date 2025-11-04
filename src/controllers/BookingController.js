const Booking = require("../models/Booking");
const Slot = require("../models/Slot");
const moment = require("moment-timezone");
const User = require("../models/User");
const Razorpay = require("razorpay");
const mongoose = require('mongoose');
require('dotenv').config();
const keyid = process.env.TEST_KEY_ID;
const secretid = process.env.TEST_SECRET_KEY;
const razorpay_instance = new Razorpay({
    key_id: keyid,
    key_secret: secretid
});



const { createPetForUser } = require("../helper/commonHelper");

exports.create_booking = async (req, res) => {
    try {
        // const userId = req.user._id;
        const {
            pet_sitter,
            start_at,
            end_at,
            mode,
            service,
            user_id,
            user_data,
            pets,
            pet_data
        } = req.body;

        // Validate service
        if (!service) {
            return res.status(400).json({ success: 0, message: "Service is required" });
        }

        // Validate pets or pet_data
        if ((!pets || pets.length === 0) && !pet_data) {
            return res.status(400).json({ success: 0, message: "At least one pet is required" });
        }
        const findPetSitter = await User.findOne({ _id: pet_sitter, role: "Pet_sitter" });
        if (!findPetSitter) {
            return res.status(400).json({ success: 0, message: "Pet sitter not found" });
        }

        let finalUserId = req.user._id;

        // If admin is creating booking
        if (req.user.role === "Admin") {
            if (!user_id && !user_data) {
                return res.status(400).json({
                    success: 0,
                    message: "User is required for Admin booking"
                });
            }

            if (user_id) {
                finalUserId = user_id;
            } else {
                const parsedUser =
                    typeof user_data === "string" ? JSON.parse(user_data) : user_data;
                const newUser = await User.create({ ...parsedUser, role: "User" });
                finalUserId = newUser._id;
            }
        }
        if (!finalUserId) {
            return res.status(500).json({ success: 0, message: "Pet Parent not found" });
        }
        // Collect pet IDs
        let petIds = [];

        // Case 1: pets already exist (IDs passed)
        if (pets) {
            let parsedPets = typeof pets === "string" ? JSON.parse(pets) : pets;
            if (Array.isArray(parsedPets) && parsedPets.length > 0) {
                petIds = parsedPets;
            }
        }

        // Case 2: new pet_data provided
        if (pet_data) {
            let parsedPetData = [];
            try {
                parsedPetData =
                    typeof pet_data === "string" ? JSON.parse(pet_data) : pet_data;
            } catch (err) {
                return res
                    .status(400)
                    .json({ success: 0, message: "Invalid pet_data JSON" });
            }

            if (!Array.isArray(parsedPetData)) {
                return res.status(400).json({
                    success: 0,
                    message: "pet_data must be an array"
                });
            }

            // Attach uploaded files (if any) to corresponding pets
            if (req.files && req.files.length > 0) {
                parsedPetData.forEach((pd, idx) => {
                    const filesForPet = req.files.filter((f) =>
                        f.fieldname.startsWith(`pet_files_${idx}_`)
                    );
                    pd.files = filesForPet;
                });
            }

            // Save each pet
            for (const pd of parsedPetData) {
                if (typeof pd !== "object") {
                    return res.status(400).json({
                        success: 0,
                        message: "Each pet_data item must be an object"
                    });
                }
                let userId = finalUserId;
                const savedPet = await createPetForUser(
                    pd,
                    pd.files || [],
                    userId
                );
                petIds.push(savedPet._id);
            }
        }

        // Create booking
        const bookingData = {
            service,
            user: finalUserId,
            mode,
            pet_sitter,
            booking_amount_rate: findPetSitter.category_fee,
            pets: petIds,
            start_at,
            end_at,
            address: req.body.address,
            state: req.body.state,
            city: req.body.city,
            pincode: req.body.pincode,
            status: "Pending"
        };


        const booking = new Booking(bookingData);
        await booking.save();

        return res.status(201).json({
            success: 1,
            message: "Booking created successfully",
            data: booking
        });
    } catch (error) {
        console.error("Booking creation error:", error);
        return res
            .status(500)
            .json({ success: 0, message: error.message || "Server error" });
    }
};


exports.get_booking = async (req, res) => {
    try {
        // await Booking.deleteMany({});
        const userId = req.user._id;
        const role = req.user.role;
        const { id, filters, date, page = 1, perPage = 10 } = req.query;
        let fdata = {}
        if (role == "User") {
            fdata['user'] = userId
        }

        if (id) {
            fdata['_id'] = id;
        }
        if (date) {
            fdata["date"] = moment.tz(date, "Asia/Kolkata").startOf("day").utc().toDate();
        }
        if (filters) {
            fdata = { ...fdata, ...JSON.parse(filters) };
        }
        const totalDocs = await Booking.countDocuments(fdata);
        const totalPages = Math.ceil(totalDocs / perPage);
        const skip = (page - 1) * perPage;
        let bookings = await Booking.find(fdata).populate([
            {
                path: 'service',
                select: "title"

            },
            {
                path: 'pets',
                populate: {
                    path: "type",
                    select: "title"
                }
            },
            {
                path: "user",
                select: 'custom_request_id name mobile gender dob address role profile_image'
            },
            {
                path: "pet_sitter",
                select: 'custom_request_id name mobile gender dob address role profile_image'
            }
        ]).sort({ booking_date: -1 }).skip(skip).limit(perPage).lean();
        bookings = bookings.map(booking => {
            // Convert dates to IST string format
            const start_at = moment.utc(booking.start_at).tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
            const end_at = moment.utc(booking.end_at).tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
            const booking_date = moment.utc(booking.booking_date).tz("Asia/Kolkata").format("YYYY-MM-DD");

            // Calculate number of days (inclusive)
            const days = moment(end_at).diff(moment(start_at), "days") + 1;

            const rates = booking.booking_amount_rate ?? [];

            let booking_amount = 0;
            booking.pets.forEach(pet => {
                const service_type = booking.service?._id;
                const petType = pet.type?._id?.toString();
                const amountPerDay = rates.find(obj => obj.category == service_type.toString() && obj.fee_type?.toString() == petType)?.fee || 0;
                booking_amount += amountPerDay * days;
            });

            return {
                ...booking,
                start_at,
                end_at,
                booking_date,
                booking_amount
            };
        });

        const pagination = { perPage, page, totalPages, totalDocs };
        return res.json({ success: 1, message: "List of bookings", data: bookings, pagination, fdata });
    } catch (err) {
        const stiackLink = err.stack?.split("\n")[1]?.trim();
        return res.json({ success: 0, message: err.message, stackLine: stiackLink })
    }
}
exports.cancel_booking = async (req, res) => {
    try {
        const { booking_id } = req.body;
        const fdata = { _id: booking_id };
        if (req.user.role == "User") {
            fdata['user'] = req.user._id
        }
        const bookingdata = await Booking.findOne(fdata);
        if (!bookingdata) {
            return res.json({ success: 0, message: "Invalid booking id" });
        }
        const blocked_slot = bookingdata.booked_slot;
        const findBookedSlot = await Slot.findOne({ _id: blocked_slot });
        if (!findBookedSlot) {
            return res.json({ success: 0, message: "No Slot found" });
        }
        await Slot.deleteOne({ _id: blocked_slot });
        const udata = {
            status: "Cancelled",
            booked_slot: null
        }
        await Booking.findOneAndUpdate({ _id: booking_id }, { $set: udata });
        return res.json({ success: 1, message: "Booking updated successfully", data: [] });


    } catch (err) {
        return res.json({ success: 0, message: err.message })
    }
}
exports.update_booking = async (req, res) => {
    try {
        const {
            _id,
            pet_sitter,
            start_at,
            end_at,
            mode,
            service,
            user_id,
            user_data,
            pets,
            pet_data
        } = req.body;

        // --- VALIDATION ---
        if (!service) return res.status(400).json({ success: 0, message: "Service is required" });
        if ((!pets || pets.length === 0) && !pet_data)
            return res.status(400).json({ success: 0, message: "At least one pet is required" });

        const findPetSitter = await User.findOne({ _id: pet_sitter, role: "Pet_sitter" });
        if (!findPetSitter)
            return res.status(400).json({ success: 0, message: "Pet sitter not found" });

        // --- DETERMINE USER ---
        let finalUserId = req.user._id;
        if (req.user.role === "Admin") {
            if (!user_id && !user_data) {
                return res.status(400).json({ success: 0, message: "User is required for Admin booking" });
            }
            if (user_id) {
                finalUserId = user_id;
            } else {
                const parsedUser = typeof user_data === "string" ? JSON.parse(user_data) : user_data;
                const newUser = await User.create({ ...parsedUser, role: "User" });
                finalUserId = newUser._id;
            }
        }

        if (!finalUserId)
            return res.status(500).json({ success: 0, message: "Pet Parent not found" });

        // --- COLLECT PET IDs ---
        let petIds = [];

        if (pets) {
            const parsedPets = typeof pets === "string" ? JSON.parse(pets) : pets;
            if (Array.isArray(parsedPets) && parsedPets.length > 0) petIds = parsedPets;
        }

        // --- HANDLE NEW PET CREATION ---
        if (pet_data) {
            let parsedPetData;
            try {
                parsedPetData = typeof pet_data === "string" ? JSON.parse(pet_data) : pet_data;
            } catch {
                return res.status(400).json({ success: 0, message: "Invalid pet_data JSON" });
            }

            if (!Array.isArray(parsedPetData))
                return res.status(400).json({ success: 0, message: "pet_data must be an array" });

            if (req.files && req.files.length > 0) {
                parsedPetData.forEach((pd, idx) => {
                    const filesForPet = req.files.filter(f => f.fieldname.startsWith(`pet_files_${idx}_`));
                    pd.files = filesForPet;
                });
            }

            for (const pd of parsedPetData) {
                if (typeof pd !== "object")
                    return res.status(400).json({ success: 0, message: "Each pet_data item must be an object" });

                const savedPet = await createPetForUser(pd, pd.files || [], finalUserId);
                petIds.push(savedPet._id);
            }
        }

        // --- BOOKING DATA ---
        const bookingData = {
            service,
            // user: finalUserId,
            mode,
            pet_sitter,
            booking_amount_rate: findPetSitter.category_fee,
            pets: petIds,
            start_at,
            end_at,
            // address: req.body.address,
            // state: req.body.state,
            // city: req.body.city,
            // pincode: req.body.pincode,

        };
        console.log(bookingData)

        let booking;
        if (_id) {
            booking = await Booking.findByIdAndUpdate(_id, bookingData, {
                new: true,
            }).populate([
                { path: "service" },
                { path: "pets", populate: { path: "type" } },
            ]);
            if (!booking) {
                return res.status(404).json({ success: 0, message: "Booking not found" });
            }
        }

        return res.status(200).json({
            success: 1,
            message: _id ? "Booking updated successfully" : "Booking created successfully",
            data: booking,
        });
    } catch (error) {
        console.error("Booking update error:", error);
        return res.status(500).json({ success: 0, message: error.message || "Server error" });
    }
};

exports.update_payment_status = async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await razorpay_instance.orders.fetch(orderId);
        if (!order) {
            return res.json({ success: 0, message: "Not found" });
        }
        const pstatu = ['paid', 'Paid', 'success', 'Success'].includes(order.status) ? 'Success' : "Failed";
        const data = { payment_status: pstatu, payment_gateway_response: order, status: order.status == "paid" ? 'booked' : "pending" };
        const bookingdata = await Booking.findOneAndUpdate({ gateway_order_id: orderId }, { $set: data }, { new: true });
        if (order.status != "paid") {
            const booked_slot = bookingdata.booked_slot;
            await Slot.deleteOne({ _id: booked_slot });
        }
        return res.json({ success: 1, message: `Your payment was ${order.status}`, data: bookingdata })
    } catch (err) {
        return res.json({ success: 0, message: err.message });
    }
}
exports.mark_booking_completed = async (req, res) => {
    try {
        const { booking_id } = req.body;
        const bdata = {
            "status": "Completed",
            "is_completed": "Completed"
        }
        const new_booking = await Booking.findOneAndUpdate({ _id: booking_id }, { $set: bdata }, { new: true });
        return res.json({ success: 1, message: "Booking updated successfully", data: new_booking })
    } catch (error) {
        return res.json({ success: 0, message: error.message })
    }
}


