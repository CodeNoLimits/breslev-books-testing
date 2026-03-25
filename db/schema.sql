-- =====================================================
-- SCHÉMA BASE DE DONNÉES - ESTHER IFRAH BRESLEV BOOKS
-- =====================================================
-- Date: 16 novembre 2025
-- Description: Schéma complet pour e-commerce livres spirituels
-- Base: MySQL 8.0+ / TiDB compatible
-- =====================================================

-- Suppression des tables existantes (en ordre inverse des dépendances)
DROP TABLE IF EXISTS reading_progress;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS favorites;
DROP TABLE IF EXISTS cart_items;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS subscription_plans;
DROP TABLE IF EXISTS book_categories;
DROP TABLE IF EXISTS books;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;

-- =====================================================
-- TABLE: users
-- =====================================================
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,
    open_id VARCHAR(255) UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role ENUM('admin', 'user') DEFAULT 'user',
    phone VARCHAR(50),
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100),
    postal_code VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_signed_in TIMESTAMP NULL,
    INDEX idx_email (email),
    INDEX idx_open_id (open_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABLE: categories
-- =====================================================
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name_fr VARCHAR(255) NOT NULL,
    name_he VARCHAR(255),
    name_en VARCHAR(255),
    slug VARCHAR(255) UNIQUE NOT NULL,
    description_fr TEXT,
    description_he TEXT,
    description_en TEXT,
    image_url VARCHAR(500),
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABLE: books
-- =====================================================
CREATE TABLE books (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title_fr VARCHAR(500) NOT NULL,
    title_he VARCHAR(500),
    title_en VARCHAR(500),
    slug VARCHAR(255) UNIQUE NOT NULL,
    author VARCHAR(255) NOT NULL,
    description_fr TEXT,
    description_he TEXT,
    description_en TEXT,
    
    -- Prix
    price_physical DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    price_digital DECIMAL(10, 2) DEFAULT NULL,
    bundle_price DECIMAL(10, 2) DEFAULT NULL,
    currency VARCHAR(3) DEFAULT 'ILS',
    
    -- Métadonnées
    pages INT,
    weight DECIMAL(5, 2) COMMENT 'Poids en kg',
    language ENUM('FR', 'HE', 'EN', 'BI') DEFAULT 'FR',
    isbn VARCHAR(20),
    
    -- Images et fichiers
    cover_image_url VARCHAR(500),
    pdf_url VARCHAR(500),
    fliphtml5_id VARCHAR(100),
    
    -- Statut
    type ENUM('book', 'brochure') DEFAULT 'book',
    in_stock BOOLEAN DEFAULT TRUE,
    stock_quantity INT DEFAULT 0,
    featured BOOLEAN DEFAULT FALSE,
    included_in_subscription BOOLEAN DEFAULT FALSE,
    
    -- Catégorie
    category_id INT,
    
    -- Dates
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    INDEX idx_slug (slug),
    INDEX idx_category (category_id),
    INDEX idx_featured (featured),
    INDEX idx_in_subscription (included_in_subscription)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABLE: book_categories (Many-to-Many)
-- =====================================================
CREATE TABLE book_categories (
    book_id INT,
    category_id INT,
    PRIMARY KEY (book_id, category_id),
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABLE: subscription_plans
-- =====================================================
CREATE TABLE subscription_plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name_fr VARCHAR(255) NOT NULL,
    name_he VARCHAR(255),
    name_en VARCHAR(255),
    slug VARCHAR(255) UNIQUE NOT NULL,
    description_fr TEXT,
    description_he TEXT,
    description_en TEXT,
    
    -- Prix et durée
    price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'ILS',
    duration_months INT NOT NULL COMMENT 'Durée en mois (1 pour mensuel, 12 pour annuel)',
    duration_type ENUM('monthly', 'yearly', 'lifetime') DEFAULT 'monthly',
    
    -- Fonctionnalités
    max_concurrent_users INT DEFAULT 1 COMMENT 'Nombre de comptes simultanés',
    features JSON COMMENT 'Liste des fonctionnalités en JSON',
    
    -- Statut
    active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    
    -- Dates
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_slug (slug),
    INDEX idx_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABLE: subscriptions
-- =====================================================
CREATE TABLE subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    plan_id INT NOT NULL,
    
    -- Statut
    status ENUM('active', 'cancelled', 'expired', 'pending', 'past_due') DEFAULT 'pending',
    
    -- Dates
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    next_billing_date DATE,
    cancelled_at TIMESTAMP NULL,
    
    -- Paiement
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'ILS',
    payment_method ENUM('stripe', 'paypal') DEFAULT 'stripe',
    payment_id VARCHAR(255) COMMENT 'ID du paiement récurrent',
    
    -- Renouvellement
    auto_renew BOOLEAN DEFAULT TRUE,
    
    -- Dates
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    INDEX idx_user (user_id),
    INDEX idx_status (status),
    INDEX idx_end_date (end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABLE: orders
-- =====================================================
CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    
    -- Montants
    subtotal DECIMAL(10, 2) NOT NULL,
    shipping_cost DECIMAL(10, 2) DEFAULT 0.00,
    tax DECIMAL(10, 2) DEFAULT 0.00,
    total_amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'ILS',
    
    -- Livraison
    shipping_address JSON COMMENT 'Adresse de livraison en JSON',
    shipping_country VARCHAR(100),
    shipping_method VARCHAR(100),
    
    -- Paiement
    payment_method ENUM('stripe', 'paypal', 'other') DEFAULT 'stripe',
    payment_status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
    payment_id VARCHAR(255),
    
    -- Statut
    status ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
    
    -- Dates
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    shipped_at TIMESTAMP NULL,
    delivered_at TIMESTAMP NULL,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_user (user_id),
    INDEX idx_order_number (order_number),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABLE: order_items
-- =====================================================
CREATE TABLE order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    book_id INT NOT NULL,
    
    -- Détails
    quantity INT NOT NULL DEFAULT 1,
    format ENUM('physical', 'digital', 'bundle') DEFAULT 'physical',
    price_at_purchase DECIMAL(10, 2) NOT NULL COMMENT 'Prix au moment de l\'achat',
    
    -- Dates
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE RESTRICT,
    INDEX idx_order (order_id),
    INDEX idx_book (book_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABLE: cart_items
-- =====================================================
CREATE TABLE cart_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    book_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    format ENUM('physical', 'digital', 'bundle') DEFAULT 'physical',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_book_format (user_id, book_id, format),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABLE: favorites
-- =====================================================
CREATE TABLE favorites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    book_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_book (user_id, book_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABLE: reviews
-- =====================================================
CREATE TABLE reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    book_id INT NOT NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    verified_purchase BOOLEAN DEFAULT FALSE,
    helpful_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    INDEX idx_book (book_id),
    INDEX idx_rating (rating),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABLE: reading_progress
-- =====================================================
CREATE TABLE reading_progress (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    book_id INT NOT NULL,
    current_page INT DEFAULT 0,
    total_pages INT,
    progress_percentage DECIMAL(5, 2) DEFAULT 0.00,
    last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    bookmarks JSON COMMENT 'Marque-pages en JSON',
    notes JSON COMMENT 'Notes de lecture en JSON',
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_book (user_id, book_id),
    INDEX idx_user (user_id),
    INDEX idx_book (book_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- FIN DU SCHÉMA
-- =====================================================

