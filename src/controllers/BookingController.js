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

exports.create_booking = async (req, res) => {
    const userId = req.user._id;
    const { pet_sitter, start_at, end_at, mode, service, user_id, user_data, pets, pet_data } = req.body;
    if (!pets || !pet_data) {
        return res.json({ success: 0, message: "Pet is required" });
    }
    if (!service) {
        return res.json({ success: 0, message: 'Service is required' })
    }

    if (req.user.role == "Admin") {
        if (!user_data || !user_id) {
            return res.json({ success: 0, message: "User is required" })
        }
    }

    if (req.user.role == "User") {

        const data = {
            service,
            user: userId,
            mode,
            pet_sitter,
            pets: JSON.parse(pets),
            start_at: start_at,
            end_at: end_at,
            status: "Pending",
        }
        const booking = new Booking(data);
        await booking.save();
        return res.json({ success: 1, message: "Created successfully", data: booking });
    }
    if (req.user.role == "Admin") {
        let userid;
        if (!user_id) {
            userid = user_id
        } else {
            const newuser = await User.create(user_data);
            userid = newuser._id;
        }
        let petids;
        if (!pets) {
            const petdata = JSON.parse(pet_data);
            petdata.map(async pd => {

            })
        }

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
        if (role == "Clinic") {
            fdata['clinic'] = userId
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
        let bookings = await Booking.find(fdata).populate([{
            path: 'clinic',
            select: 'custom_request_id name mobile  address role profile_image'
        },
        {
            path: "user",
            select: 'custom_request_id name mobile gender dob address role profile_image'
        },
        {
            path: "doctor",
            select: 'custom_request_id name mobile gender dob address role profile_image'
        }
        ]).sort({ booking_date: -1 }).skip(skip).limit(perPage).lean();
        bookings = bookings.map(booking => ({
            ...booking,
            start_at: moment.utc(booking.start_at).tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss"),
            end_at: moment.utc(booking.end_at).tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss"),
            booking_date: moment.utc(booking.booking_date).tz("Asia/Kolkata").format("YYYY-MM-DD")
        }));
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
        const { clinic_id, doctor_id, slot_id, booking_date, booking_id } = req.body;
        const fdata = {
            _id: booking_id
        }
        if (req.user.role == "User") {
            fdata['user'] = req.user._id
        }
        const findbooking = await Booking.findOne(fdata);
        if (!findbooking) {
            return res.json({ success: 0, message: "Invalid booking id" });
        }
        const slots = await Slot.findOne({ _id: slot_id, doctor: doctor_id, status: "available" })
            .lean();
        if (!slots) {
            return res.status(400).json({ success: 0, message: "Slot not available or already booked" });
        }
        const isBlocked = await Slot.findOne({ slot_id: slot_id, date: moment.tz(booking_date, "Asia/Kolkata").startOf("day").utc().toDate() });
        if (isBlocked) {
            return res.json({ success: 0, data: [], message: "This slot is already booked" });
        }

        // Extract the time part from slot and apply it to the booking_date
        const slotStart = moment(`${booking_date} ${slots.start_time}`).tz("Asia/Kolkata").format("HH:mm");
        const slotEnd = moment(`${booking_date} ${slots.end_time}`).tz("Asia/Kolkata").format("HH:mm");
        const start_at = moment.tz(`${booking_date} ${slotStart}`, "YYYY-MM-DD HH:mm", "Asia/Kolkata").utc().toDate();
        const end_at = moment.tz(`${booking_date} ${slotEnd}`, "YYYY-MM-DD HH:mm", "Asia/Kolkata").utc().toDate();
        // return res.json({ start_at, end_at });
        const bdata = {
            doctor: doctor_id,
            booking_date: moment.tz(booking_date, "Asia/Kolkata").startOf("day").utc().toDate(),
            start_at,
            end_at,
            duration: (end_at.getTime() - start_at.getTime()) / 60000,
            status: "booked"
        };
        const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const parsedDate = new Date(booking_date);
        const weekdayname = weekdays[parsedDate.getDay()];

        const blockdata = {
            weekdayName: weekdayname,
            status: "blocked",
            clinic: clinic_id,
            "doctor": doctor_id,
            "slot_id": slots._id,
            date: moment.tz(booking_date, "Asia/Kolkata").startOf("day").utc().toDate(),
            start_time: slots.start_time,
            end_time: slots.end_time,
            createdAt: new Date()
        }
        // console.log(bdata);
        // return res.json({ bdata });
        await Slot.deleteOne({ _id: findbooking.booked_slot });
        const blockedSlot = await Slot.create(blockdata);
        bdata['booked_slot'] = blockedSlot._id;
        const new_booking = await Booking.findOneAndUpdate({ _id: booking_id }, { $set: bdata }, { new: true }).populate('booked_slot');
        return res.json({ success: 1, message: "Booking updated successfully", data: new_booking })
    } catch (err) {
        return res.json({ success: 0, message: err.message })
    }
}
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


