const admin = require("firebase-admin");

if (!admin.apps.length) {
    const serviceAccount = JSON.parse(
        process.env.FIREBASE_ADMIN_JSON
    );

    console.log(
        "Firebase loaded from env =",
        !!process.env.FIREBASE_ADMIN_JSON
    );

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

module.exports = admin;
