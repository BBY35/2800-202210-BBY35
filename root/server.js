// used for validating the code with https://jshint.com/
/* jshint esversion: 6 */
/* jshint node: true */

"use strict";

// Constants
const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const fs = require("fs");
const jsdom = require("jsdom");
const http = require("http");
const https = require("https");
// tiny-editor requires that there be a document object from HTML; 
// as there is no HTML element just yet, it is safe to comment out
// const tinyeditor = require("tiny-editor"); 
const sanitize = require("sanitize-html");
const multer = require("multer");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "./root/img/uploads");
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname.split("/").pop().trim())
    }
});
const upload = multer({ storage: storage });

const app = express();

const dbConnection = {
    host: "localhost",
    user: "nodeapp",
    password: "",
    database: "COMP2800",
    port: 3306
};
const mysql2 = require("mysql2");
const connection = mysql2.createPool(dbConnection);

// initializing sessions
let sessionObj = {
    secret: "Hey, another password that will be obscured eventually. Neat!",
    name: "petpalsID",
    resave: false,
    saveUninitialized: true
};

app.use(bodyParser.json());
app.use(session(sessionObj));

app.use("/common", express.static("./root/common"));
app.use("/css", express.static("./root/css"));
app.use("/img", express.static("./root/img"));
app.use("/font", express.static("./root/font"));
app.use("/js", express.static("./root/js/clientside"));
app.use("/scss", express.static("./root/scss"));

app.post("/add-account", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    console.log(req.body);

    // TODO Figure out simplified SQL to insert if not exists.
    connection.query("SELECT username FROM BBY35_accounts WHERE username = ? UNION ALL SELECT username FROM BBY35_accounts WHERE email = ?", [req.body.username, req.body.email],
        (error, results, fields) => {
            if (error) {
                res.send({ status: "failure", msg: "Internal Server Error" });
            } else if (results.length > 0) {
                res.send({ status: "failure", msg: "Username or email already taken!" })
            } else {
                connection.query("INSERT INTO BBY35_accounts (username, firstname, lastname, email, password, is_admin, is_caretaker)"
                    + "values (?, ?, ?, ?, ?, 0, 0)",
                    [req.body.username, req.body.firstname, req.body.lastname,
                    req.body.email, req.body.password, req.body.is_admin, req.body.is_caretaker],
                    (error, results, fields) => {
                        if (error) {
                            res.send({ status: "failure", msg: "Internal Server Error" });
                        } else {
                            res.send({ status: "success", msg: "Record added." });
                        }
                    });
            }
        });
});

app.get("/", (req, res) => {
    res.redirect("/home");
});

app.get("/home", (req, res) => {
    if (!(req.session.loggedIn)) {
        res.redirect("/login");
    } else if (req.session.admin) {
        let doc = fs.readFileSync("./root/user_management.html", "utf-8");
        res.send(doc);
    } else {
        let doc = fs.readFileSync("./root/index.html", "utf-8");
        let pageDOM = new jsdom.JSDOM(doc);
        let user = req.session.username;
        pageDOM.window.document.getElementById("username").innerHTML = user;
        res.send(pageDOM.serialize());
    }
});

app.get("/login", (req, res) => {
    if (req.session.loggedIn && req.session.admin) {
        let doc = fs.readFileSync("./root/user_management.html", "utf-8");
        res.send(doc);
    } else if (req.session.loggedIn && !req.session.admin) {
        let doc = fs.readFileSync("./root/index.html", "utf-8");
        res.send(doc);
    } else {
        let doc = fs.readFileSync("./root/login.html", "utf-8");
        res.send(doc);
    }
});

app.post("/login", (req, res) => {
    res.setHeader("content-type", "application/json");
    
    let username = req.body.username;
    let password = req.body.password;
    if (username && password) {
        connection.query("SELECT * FROM BBY35_accounts WHERE username = ? AND password = ?", [username, password], (err, data, fields) => {
            if (err) throw err;
            if (data.length > 0) {
                req.session.loggedIn = true;
                req.session.username = data[0].username;
                req.session.name = data[0].firstname + "," + data[0].lastname;
                req.session.username = data[0].username;
                req.session.email = data[0].email;
                req.session.userid = data[0].id;
                req.session.admin = data[0].is_admin;
                req.session.caretaker = data[0].is_caretaker;
                req.session.save((e) => {
                    if (e) {
                        console.log("Error: " + e);
                    }
                });
                res.send({ status: "success", msg: "Log In Successful" });
            } else {
                res.send({ status: "failure", msg: "Log In Unsuccessful" });
            }
        });
    }
});

app.get("/logout", (req, res) => {
    if (req.session) {
        req.session.destroy((error) => {
            if (error) {
                res.status(400).send("Unable to log out");
            } else {
                // session deleted, redirect to home
                res.redirect("/");
            }
        });
    }
});

app.get("/profile", (req, res) => {
    if (!(req.session && req.session.loggedIn)) return res.redirect("/login");

    let doc = fs.readFileSync("./root/profile.html", "utf-8");
    let pageDOM = new jsdom.JSDOM(doc);
    let pageDocument = pageDOM.window.document;
    let img_location = ""; // TODO FILL IN IMG
    let first_last_name = req.session.name.split(',');

    pageDocument.getElementById("profile_picture").style = `background-image: url(${img_location});`;
    pageDocument.getElementById("username").textContent = req.session.username;
    pageDocument.getElementById("first_name").textContent = first_last_name[0];
    pageDocument.getElementById("last_name").textContent = first_last_name[1];
    pageDocument.getElementById("email").textContent = req.session.email;

    res.send(pageDOM.serialize());
});

app.get("/userData", (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.session.admin) {
        connection.query("SELECT id, username, firstname, lastname, email, is_admin, is_caretaker FROM BBY35_accounts", (err, data, fields) => {
            res.send(data);
        });
    } else {
        res.send({ status: "failure", msg: "User not logged in!" });
    }
});

app.get("/petData", (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.session.caretaker == 0) {
        connection.query('SELECT id, caretaker_id, photo_url, name, species, gender, description FROM BBY35_pets WHERE owner_id = ?', [req.session.userid], (err, data, fields) => {
            res.send(data);
        });
    } else {
        res.send({ status: "failure", msg: "User not logged in!" });
    }
});

// this route is for testing and example purposes only and should be cleaned up once the forms requiring image upload are completed
app.get("/addPhoto", (req, res) => {
    let doc = fs.readFileSync("./root/addphoto.html", "utf-8");
    res.send(doc);
});

app.post("/addPhoto", upload.single("picture"), (req, res) => {
    console.log(req.file);
    res.statusCode = 201;
    res.send( {url: req.file.filename} );
});

app.delete("/delete", async (req, res) => {
    let requesterID = req.session.userid;
    let isRequesterAdmin = req.session.admin;
    let accountID  = req.body.id;
    
    let targetName;
    let isTargetAdmin;
    let adminCount;
    
    async function getTargetInfo(id) {
        await connection.promise()
        .query("SELECT username, is_admin FROM BBY35_accounts WHERE id = ?", [id])
        .then((data) => {
            targetName = data[0][0].username;
            isTargetAdmin = data[0][0].is_admin;
        });
    }

    async function getAdminCount() {
        await connection.promise()
        .query("SELECT id FROM BBY35_accounts WHERE is_admin = 1")
        .then((data) => {
            adminCount = data[0].length;
        });
    }

    await getTargetInfo(accountID);
    await getAdminCount();

    let userSelfDelete = (!isRequesterAdmin && (accountID == requesterID));
    let areRequesterAndTargetAdmins = (isTargetAdmin && isRequesterAdmin);
    let adminOnAdminDelete = (areRequesterAndTargetAdmins && (adminCount >= 2));
    let adminOnUserDelete = (!isTargetAdmin && isRequesterAdmin);
    let adminDelete =  (adminOnAdminDelete || adminOnUserDelete);
    let allowDelete = (userSelfDelete || adminDelete);

    if (allowDelete) {
        connection.query('UPDATE BBY35_accounts SET username = NULL, password = NULL, firstname = "DELETED", lastname = "USER", is_admin = 0  WHERE id = ?', [accountID], async () => {
            await getAdminCount();
            if (adminOnAdminDelete) {
                res.send({ status: "success", msg: `Removed user: ${targetName}; Remaining admins: ${adminCount}`});
            } else if (userSelfDelete) {
                res.send({ status: "success", msg: `Your account has been removed.`});
            } else {
                res.send({ status: "success", msg: `Removed user: ${targetName}`});
            }
        });
    } else {
        res.send({status: "failure", msg: `Could not remove user ${targetName}` });
    }
});

app.put("/grant", async (req, res) => {
    let isRequesterAdmin = req.session.admin;
    let accountID  = req.body.id;

    let targetName;
    let isTargetAdmin;

    async function getTargetInfo(id) {
        await connection.promise()
        .query("SELECT username, is_admin FROM BBY35_accounts WHERE id = ?", [id])
        .then((data) => {
            targetName = data[0][0].username;
            isTargetAdmin = data[0][0].is_admin;
        });
    }

    await getTargetInfo(accountID);

    if (isRequesterAdmin && !isTargetAdmin) {
        connection.query('UPDATE BBY35_accounts SET is_admin = 1 WHERE id = ?', [accountID], async () => {
            res.send({status: "success", msg: `User ${targetName} was granted admin privileges`})
        });
    } else {
        res.send({status: "failure", msg: `User ${targetName} could not be granted admin privileges`});
    }
});

app.put("/revoke", async (req, res) => {
    let requesterID = req.session.userid;
    let isRequesterAdmin = req.session.admin;
    let accountID  = req.body.id;
    
    let targetName;
    let isTargetAdmin;
    let adminCount;
    
    async function getTargetInfo(id) {
        await connection.promise()
        .query("SELECT username, is_admin FROM BBY35_accounts WHERE id = ?", [id])
        .then((data) => {
            targetName = data[0][0].username;
            isTargetAdmin = data[0][0].is_admin;
        });
    }

    async function getAdminCount() {
        await connection.promise()
        .query("SELECT id FROM BBY35_accounts WHERE is_admin = 1")
        .then((data) => {
            adminCount = data[0].length;
        });
    }

    await getTargetInfo(accountID);
    await getAdminCount();

    let isSelfRevoke = (requesterID == accountID);
    let areRequesterAndTargetAdmins = (isTargetAdmin && isRequesterAdmin);
    let allowRevoke = (!isSelfRevoke && areRequesterAndTargetAdmins && (adminCount >= 2));

    if (allowRevoke) {
        connection.query('UPDATE BBY35_accounts SET is_admin = 0  WHERE id = ?', [accountID], async () => {
            await getAdminCount();
            res.send({ status: "success", msg: `Revoked admin: ${targetName}; Remaining admins: ${adminCount}`});
        });
    } else {
        res.send({status: "failure", msg: `Could not revoke admin ${targetName}` });
    }
});

console.log("Starting Server...");

const port = 8000;
function onBoot() {
    console.log("Started on port: " + port);
}

app.listen(port, onBoot);