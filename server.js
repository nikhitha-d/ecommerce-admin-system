const express = require('express');
const db = require('./db');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();

// ================= MIDDLEWARE =================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true
}));

// ================= FILE UPLOAD (MULTER) =================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

const upload = multer({ storage: storage });

// ================= AUTH MIDDLEWARE =================
function checkAuth(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login.html');
    }
}

// ================= SERVER START =================
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});

// ================= LOGIN =================
app.post('/login', (req, res) => {
    const { email, password, remember } = req.body;

    const sql = "SELECT * FROM users WHERE email = ?";

    db.query(sql, [email], async (err, result) => {
        if (err) return res.send("Error");

        if (result.length === 0) return res.send("User not found");

        const user = result[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.send("Invalid password");
        // ✅ Remember me logic
        if (remember) {
            res.cookie("user", user.id, {
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            });
        }
        req.session.user = user;
        if (user.role === "admin") {
            res.redirect('/dashboard.html');
        } else {
            res.redirect('/shop.html');
        }
    });
});

const cookieParser = require('cookie-parser');
app.use(cookieParser());


// ================= forgot password =================
app.use(express.json());

app.post('/reset-password', async (req, res) => {
    const { email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const sql = "UPDATE users SET password = ? WHERE email = ?";

    db.query(sql, [hashedPassword, email], (err, result) => {
        if (err) {
            console.log(err);
            return res.send("Error resetting password");
        }

        if (result.affectedRows === 0) {
            return res.send("Email not found");
        }

        res.send("Password updated successfully");
    });
});
//REGISTER/SIGNUP
app.post('/register', async (req, res) => {
    const { name, email, password } = req.body;

    const checkSql = "SELECT * FROM users WHERE email = ?";
    db.query(checkSql, [email], async (err, result) => {
        if (result.length > 0) {
            return res.send("User already exists");
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)";

        db.query(sql, [name, email, hashedPassword, "user"], (err) => {
            if (err) {
                console.log(err);
                return res.send("Error registering");
            }
            db.query(
                "INSERT INTO notifications (title, message, type) VALUES (?, ?, ?)",
                ["New User Registered", `${name} signed up`, "success"]
            );

            res.send("Signup successful!");
        });
    });
});

// ================= GET USERS =================
app.get('/get-users', (req, res) => {
    db.query("SELECT * FROM users", (err, result) => {
        if (err) return res.json([]);
        res.json(result);
    });
});

// ================= ADD USER =================
app.post('/add-user', async (req, res) => {
    const { name, email, role, password, confirm_password } = req.body;

    if (password !== confirm_password) {
        return res.send("Passwords do not match");
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = "INSERT INTO users (name, email, role, password) VALUES (?, ?, ?, ?)";

        db.query(sql, [name, email, role, hashedPassword], (err) => {
            if (err) return res.send("Error adding user");

        db.query(
    "INSERT INTO notifications (title, message, type) VALUES (?, ?, ?)",
    ["New User Registered", `${name} created an account`, "success"],
    (err) => {
        if (err) {
            console.log("Notification Error:", err);
        } else {
            console.log("Notification added ✅");
        }
    }
);
            res.redirect('/users.html');
        });

    } catch (err) {
        console.log(err);
        res.send("Error hashing password");
    }
});
// ================= USER STATS =================
app.get('/user-stats', (req, res) => {
    const sql = "SELECT role, COUNT(*) AS count FROM users GROUP BY role";

    db.query(sql, (err, result) => {
        if (err) return res.json([]);
        res.json(result);
    });
});

// ================= UPDATE USER =================
app.post('/update-user/:id', async (req, res) => {
    const id = req.params.id;
    const { name, email, role, password } = req.body;

    let sql;
    let values;

    if (password && password.trim() !== "") {
        // 🔐 If password is entered → hash and update
        const hashedPassword = await bcrypt.hash(password, 10);

        sql = "UPDATE users SET name=?, email=?, role=?, password=? WHERE id=?";
        values = [name, email, role, hashedPassword, id];

    } else {
        // 🔥 If no password → DO NOT touch password field
        sql = "UPDATE users SET name=?, email=?, role=? WHERE id=?";
        values = [name, email, role, id];
    }

    db.query(sql, values, (err) => {
        if (err) {
            console.log(err);
            return res.send("Error updating user");
        }

        res.redirect('/users.html');
    });
});

// ================= DELETE USER =================
app.get('/delete-user/:id', (req, res) => {
    db.query("DELETE FROM users WHERE id=?", [req.params.id], (err) => {
        if (err) return res.send("Error deleting user");

        res.send("Deleted");
    });
});

// ================= ADD PRODUCT =================
app.post('/add-product', upload.single('product_image'), (req, res) => {

    const product_name = req.body?.product_name || "";
    const category_id = req.body?.category_id || null; // ✅ FIXED
    const price = req.body?.price || "";
    const stock = req.body?.stock || "";
    const description = req.body?.description || "";
    const image = req.file ? req.file.filename : null;
    const sql = `
        INSERT INTO products 
        (product_name, category_id, price, stock, image, description)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    db.query(sql, 
        [product_name, category_id, price, stock, image, description],
        (err, result) => {
            if (err) {
                console.log(err);
                return res.status(500).send("Error inserting product");
            }
            // notification
            db.query(
                "INSERT INTO notifications (title, message, type) VALUES (?, ?, ?)",
                ["New Product Added", `${product_name} added to system`, "info"]
            );

            res.json({ message: "Product added successfully" });
        }
    );
    console.log("BODY:", req.body);
    console.log("FILE:", req.file);
});
// ================= GET PRODUCTS =================
app.get('/get-products', (req, res) => {

    const sql = `
        SELECT 
            p.id,
            p.product_name,
            p.price,
            p.stock,
            p.image,
            c.category_name
        FROM products p
        LEFT JOIN categories c
        ON p.category_id = c.id
    `;

    db.query(sql, (err, result) => {
        if (err) {
            console.log("🔥 REAL SQL ERROR:", err);  // 👈 MUST SEE THIS
            return res.status(500).json(err);
        }
        res.json(result);
    });
});
// ================= DELETE PRODUCT =================
app.get('/delete-product/:id', (req, res) => {
    db.query("DELETE FROM products WHERE id=?", [req.params.id], (err) => {
        if (err) return res.send("Error deleting product");

        res.send("Deleted");
    });
});
// ================= UPDATE PRODUCT =================
app.post('/update-product/:id', (req, res) => {
    const id = req.params.id;
    const { product_name, category_id, price, stock, description } = req.body;
    const sql = `
    UPDATE products 
    SET product_name=?, category_id=?, price=?, stock=?, description=?
    WHERE id=?
`;
    db.query(sql, [product_name, category_id, price, stock, description, id], (err) => {
        if (err) {
            console.log(err);
            return res.send("Error updating product");
        }

        if (stock == 0) {
        db.query(
            "INSERT INTO notifications (title, message, type) VALUES (?, ?, ?)",
            ["Product Out of Stock", `${product_name} is out of stock`, "danger"]
        );
    }
        res.json({ message: "Updated successfully" });
    });
});
// ================= SEARCH PRODUCT =================
app.get('/search-product', (req, res) => {
    let search = req.query.search;

    const sql = `
        SELECT 
            p.id,
            p.product_name,
            p.price,
            p.stock,
            p.image,
            c.category_name
        FROM products p
        LEFT JOIN categories c
        ON p.category_id = c.id
        WHERE p.product_name LIKE ?
        OR c.category_name LIKE ?
    `;

    db.query(sql, [`%${search}%`, `%${search}%`], (err, results) => {
        if (err) {
            console.log("SEARCH ERROR:", err);
            return res.status(500).json(err);
        }
        res.json(results);
    });
});

//================= ADD ORDER =================
app.post('/add-order', (req, res) => {
    const user = req.session.user;

    if (!user) {
        return res.send("Please login first");
    }

    const { product, quantity, total_amount } = req.body;

    const sql = `
        INSERT INTO orders 
        (customer_name, product, quantity, total_amount, payment_status, order_status)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, 
        [user.name, product, quantity, total_amount, "Pending", "Placed"],
        (err) => {
            if (err) return res.send("Error adding order");

            res.send("Order placed successfully");
        }
    );
});
//================= GET ORDERS =================
app.get('/get-orders', (req, res) => {
    db.query("SELECT * FROM orders", (err, result) => {
        if (err) return res.json([]);
        res.json(result);
    });
});
//================= SEARCH ORDER =================
app.get('/search-order', (req, res) => {
    let search = req.query.search;
    const sql = `
        SELECT * FROM orders 
        WHERE customer_name LIKE ? 
        OR id LIKE ?
    `;
    db.query(sql, [`%${search}%`, `%${search}%`], (err, results) => {
        if (err) return res.json([]);
        res.json(results);
    });
});
//================= DELETE ORDER =================
app.get('/delete-order/:id', (req, res) => {
    db.query("DELETE FROM orders WHERE id=?", [req.params.id], (err) => {
        if (err) return res.send("Error deleting");
        res.send("Deleted");
    });
});
//================= ADD CATEGORY =================
app.post('/add-category', (req, res) => {
    const { category_name, category_description } = req.body;

    const sql = `
        INSERT INTO categories (category_name, category_description)
        VALUES (?, ?)
    `;
    db.query(sql, [category_name, category_description], (err) => {
        if (err) return res.send("Error adding category");
        res.redirect('/categories.html');
    });
});
//================= GET ALL CATEGORY =================
app.get('/get-categories', (req, res) => {
    db.query("SELECT * FROM categories", (err, result) => {
        if (err) return res.json([]);
        res.json(result);
    });
});
//================= SEARCH CATEGORY =================
app.get('/search-category', (req, res) => {
    let search = req.query.search;
    const sql = `
        SELECT * FROM categories 
        WHERE category_name LIKE ?
    `;
    db.query(sql, [`%${search}%`], (err, result) => {
        if (err) return res.json([]);
        res.json(result);
    });
});
//================= DELETE CATEGORY =================
app.get('/delete-category/:id', (req, res) => {
    db.query("DELETE FROM categories WHERE id=?", [req.params.id], (err) => {
        if (err) return res.send("Error deleting");
        res.send("Deleted");
    });
});
//================= UPDATE CATEGORY =================
app.post('/update-category/:id', (req, res) => {
    const id = req.params.id;
    const { category_name, category_description } = req.body;
    const sql = `
        UPDATE categories 
        SET category_name=?, category_description=?
        WHERE id=?
    `;
    db.query(sql, [category_name, category_description, id], (err) => {
        if (err) return res.send("Error updating");
        res.json({ message: "Updated successfully" });
    });
});

//================= REPORT =================
app.get('/get-reports', (req, res) => {

    // TOTAL USERS
    const usersQuery = "SELECT COUNT(*) AS totalUsers FROM users";

    // TOTAL PRODUCTS
    const productsQuery = "SELECT COUNT(*) AS totalProducts FROM products";

    // TOTAL ORDERS + REVENUE
    const ordersQuery = `
        SELECT 
            COUNT(*) AS totalOrders,
            SUM(total_amount) AS totalRevenue
        FROM orders
    `;

    // TODAY SALES
    const todaySalesQuery = `
        SELECT SUM(total_amount) AS todaySales 
        FROM orders 
        WHERE DATE(created_at) = CURDATE()
    `;

    // WEEK SALES
    const weekSalesQuery = `
        SELECT SUM(total_amount) AS weekSales 
        FROM orders 
        WHERE YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)
    `;

    // MONTH SALES
    const monthSalesQuery = `
        SELECT SUM(total_amount) AS monthSales 
        FROM orders 
        WHERE MONTH(created_at) = MONTH(CURDATE())
    `;

    // MOST SOLD PRODUCT
    const topProductQuery = `
        SELECT product, SUM(quantity) AS total 
        FROM orders 
        GROUP BY product 
        ORDER BY total DESC 
        LIMIT 1
    `;

    // TOP CATEGORY
    const topCategoryQuery = `
        SELECT category, COUNT(*) AS total 
        FROM products 
        GROUP BY category 
        ORDER BY total DESC 
        LIMIT 1
    `;

    // EXECUTE ALL
    db.query(usersQuery, (err, usersResult) => {
        db.query(productsQuery, (err, productsResult) => {
            db.query(ordersQuery, (err, ordersResult) => {
                db.query(todaySalesQuery, (err, todayResult) => {
                    db.query(weekSalesQuery, (err, weekResult) => {
                        db.query(monthSalesQuery, (err, monthResult) => {
                            db.query(topProductQuery, (err, productResult) => {
                                db.query(topCategoryQuery, (err, categoryResult) => {

                                    res.json({
                                        totalUsers: usersResult?.[0]?.totalUsers || 0,
                                        totalProducts: productsResult?.[0]?.totalProducts || 0,
                                        totalOrders: ordersResult?.[0]?.totalOrders || 0,
                                        totalRevenue: ordersResult?.[0]?.totalRevenue || 0,
                                        todaySales: todayResult?.[0]?.todaySales || 0,
                                        weekSales: weekResult?.[0]?.weekSales || 0,
                                        monthSales: monthResult?.[0]?.monthSales || 0,
                                        topProduct: productResult?.[0]?.product || "N/A",
                                        topCategory: categoryResult?.[0]?.category || "N/A"
});
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});


app.get('/get-notifications', (req, res) => {
    db.query("SELECT * FROM notifications ORDER BY created_at DESC", (err, result) => {
        if (err) return res.json([]);
        res.json(result);
    });
});

app.post('/add-notification', (req, res) => {
    const { title, message, type } = req.body;
    const sql = `
        INSERT INTO notifications (title, message, type)
        VALUES (?, ?, ?)
    `;
    db.query(sql, [title, message, type], (err) => {
        if (err) return res.send("Error adding notification");
        res.send("Notification added");
    });
});

//add-order in user end
app.get('/my-orders', (req, res) => {
    const user = req.session.user;

    if (!user) {
        return res.json([]);
    }

    db.query(
        "SELECT * FROM orders WHERE customer_name = ?",
        [user.name],
        (err, result) => {
            if (err) return res.json([]);
            res.json(result);
        }
    );
});
//cancel order in user end
app.get('/cancel-order/:id', (req, res) => {
    const user = req.session.user;
    if (!user) return res.send("Login required");
    db.query(
        "UPDATE orders SET order_status='Cancelled' WHERE id=? AND customer_name=?",
        [req.params.id, user.name],
        (err) => {
            if (err) return res.send("Error cancelling");
            res.send("Order cancelled");
        }
    );
});