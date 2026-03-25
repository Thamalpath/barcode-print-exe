import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import logo from "./assets/logo.png";

const formatPrice = (number) => {
  const val = parseFloat(number);
  if (isNaN(val)) return "Rs. 0.00";
  return val.toFixed(2);
};

function App() {
  const itemsPerPage = 5;
  const [queue, setQueue] = useState([]);
  const [token, setToken] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [locations, setLocations] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [loginError, setLoginError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [priceLevels, setPriceLevels] = useState([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [pendingProduct, setPendingProduct] = useState(null);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [isFetchingPriceLevels, setIsFetchingPriceLevels] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  // Fetch locations
  useEffect(() => {
    async function getLocations() {
      try {
        const res = await invoke("fetch_locations");
        if (res.success && Array.isArray(res.data)) {
          setLocations(res.data);
        } else if (Array.isArray(res)) {
          setLocations(res);
        }
      } catch (err) {
        console.error("Failed to fetch locations", err);
      }
    }
    getLocations();
  }, []);

  // Debounced Search
  useEffect(() => {
    if (!isLoggedIn) return;

    const delayDebounceFn = setTimeout(() => {
      if (searchTerm.trim()) {
        performSearch(searchTerm);
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, isLoggedIn]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");
    setIsLoggingIn(true);
    try {
      const response = await invoke("login", {
        name: username,
        password: password,
        location: selectedLocation || null,
      });

      if (response.token) {
        localStorage.setItem("token", response.token);
        localStorage.setItem("user", JSON.stringify(response.user));
        if (selectedLocation) {
          localStorage.setItem("userLocation", selectedLocation);
        }

        setToken(response.token);
        setIsLoggedIn(true);
      }
    } catch (err) {
      setLoginError(err.toString());
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("userLocation");
    setIsLoggedIn(false);
    setToken(null);
    setUsername("");
    setPassword("");
    setSearchTerm("");
    setSearchResults([]);
    setQueue([]);
  };

  // Check for existing session
  useEffect(() => {
    const savedToken = localStorage.getItem("token");
    if (savedToken) {
      setToken(savedToken);
      setIsLoggedIn(true);
    }
  }, []);

  const performSearch = async (term) => {
    try {
      const products = await invoke("search_products", { term, token });
      // Ensure every product has a stable ID
      const productsWithIds = products.map((p, idx) => ({
        ...p,
        id: p.id || p.prod_code || p.product_code || `temp-${idx}-${term}`,
      }));
      setSearchResults(productsWithIds);
      setCurrentPage(1);
    } catch (err) {
      console.error("Search failed", err);
      alert("Search failed: " + err);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      performSearch(searchTerm);
    }
  };

  const handleAddClick = async (product) => {
    console.log("Add clicked for product:", product);
    const qty = parseInt(quantities[product.id] || 1);
    if (qty <= 0) {
      alert("Please enter a valid quantity");
      return;
    }

    setPendingProduct(product);
    setShowPriceModal(true);
    setIsFetchingPriceLevels(true);

    const prod_code =
      product.prod_code || product.product_code || product.code || "";
    if (!String(prod_code).trim()) {
      setIsFetchingPriceLevels(false);
      setShowPriceModal(false);
      setPendingProduct(null);
      alert(
        "This product has no prod_code, so price levels cannot be fetched.",
      );
      return;
    }

    try {
      const levels = await invoke("fetch_price_levels", {
        token,
        prodCode: prod_code,
      });
      setPriceLevels(Array.isArray(levels) ? levels : []);
    } catch (err) {
      console.error("Failed to fetch price levels", err);
      setPriceLevels([]);
      alert("Could not fetch additional price levels: " + err);
    } finally {
      setIsFetchingPriceLevels(false);
    }
  };

  const handlePriceSelect = (level) => {
    let selectedPrice =
      pendingProduct.selling_price || pendingProduct.price || 0;

    if (level) {
      if (level.selling_price) {
        selectedPrice = level.selling_price;
      } else if (level.price) {
        selectedPrice = level.price;
      } else {
        // Fallback to name/code lookup in product
        const priceKey = level.code || level.name || level.id;
        if (pendingProduct[priceKey]) {
          selectedPrice = pendingProduct[priceKey];
        }
      }
    }

    addToQueue(pendingProduct, selectedPrice);
    setShowPriceModal(false);
    setPendingProduct(null);
  };

  const addToQueue = (product, overridePrice = null) => {
    const qty = parseInt(quantities[product.id] || 1);
    if (qty <= 0) return;

    const priceToUse =
      overridePrice !== null
        ? overridePrice
        : product.selling_price || product.price || 0;

    const mapped = {
      id: product.id,
      code: product.prod_code || product.product_code || product.code || "N/A",
      name:
        product.prod_name ||
        product.product_name ||
        product.product_name_en ||
        product.name ||
        "Unknown",
      price: formatPrice(priceToUse),
      qty: qty,
      barcode:
        product.barcode ||
        product.prod_code ||
        product.product_code ||
        product.code ||
        "N/A",
    };

    setQueue([...queue, mapped]);

    const newQuantities = { ...quantities };
    delete newQuantities[product.id];
    setQuantities(newQuantities);
  };

  const removeFromQueue = (index) => {
    const newQueue = [...queue];
    newQueue.splice(index, 1);
    setQueue(newQueue);
  };

  const handlePrint = async () => {
    if (queue.length === 0) return;

    try {
      await invoke("print_labels", { items: queue });
      setQueue([]);
    } catch (err) {
      console.error(err);
      alert("Print failed: " + err);
    }
  };

  const handleReset = () => {
    setSearchTerm("");
    setSearchResults([]);
    setQueue([]);
    setQuantities({});
    setCurrentPage(1);
  };

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = searchResults.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(searchResults.length / itemsPerPage);

  const nextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const prevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  if (!isLoggedIn) {
    return (
      <div className="login-overlay">
        <div style={{ position: "absolute", top: "1.5rem", right: "1.5rem" }}>
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === "dark" ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
            <span style={{ marginLeft: "4px" }}>
              {theme === "dark" ? "Light" : "Dark"}
            </span>
          </button>
        </div>
        <div className="login-card">
          <div className="login-logo">
            <img src={logo} alt="Venpaa Logo" />
          </div>
          <h2>Venpaa Printer Login</h2>
          {loginError && <div className="error-msg">{loginError}</div>}
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Location (Optional)</label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
              >
                <option value="">Use Default Location</option>
                {locations.map((loc) => (
                  <option
                    key={loc.id}
                    value={loc.loca_code || loc.code || loc.id}
                  >
                    {loc.loca_name ||
                      loc.name ||
                      loc.location_name ||
                      `Location ${loc.id}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <div className="input-with-icon">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="input-icon-btn"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <button className="login-btn" type="submit" disabled={isLoggingIn}>
              {isLoggingIn ? "Logging in..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "relative",
          marginBottom: "1rem",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={
              theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"
            }
          >
            {theme === "dark" ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
        <h1
          style={{
            margin: 0,
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          Venpaa Barcode Printer
        </h1>
        <button className="reset-btn" onClick={handleReset}>
          Reset All
        </button>
      </div>

      <div className="main-layout">
        <div className="left-column">
          <form className="search-section" onSubmit={handleSearchSubmit}>
            <input
              placeholder="Search Product (Name/Code)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button type="submit">Search</button>
          </form>

          {searchResults.length > 0 && (
            <div className="table-container">
              <h2 className="section-title">Search Results</h2>
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Price</th>
                    <th>Qty</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {currentItems.map((p) => {
                    const id = p.id;
                    const code =
                      p.prod_code || p.product_code || p.code || "N/A";
                    const name =
                      p.prod_name ||
                      p.product_name ||
                      p.product_name_en ||
                      p.name ||
                      "Unknown";
                    const price = formatPrice(p.selling_price || p.price || 0);

                    return (
                      <tr key={id}>
                        <td>{code}</td>
                        <td>{name}</td>
                        <td>{price}</td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            value={quantities[id] || 1}
                            onChange={(e) =>
                              setQuantities({
                                ...quantities,
                                [id]: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <button
                            className="action-btn"
                            disabled={
                              isFetchingPriceLevels && pendingProduct?.id === id
                            }
                            onClick={() => handleAddClick(p)}
                          >
                            {isFetchingPriceLevels && pendingProduct?.id === id
                              ? "..."
                              : "Add"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {searchResults.length > itemsPerPage && (
                <div className="pagination">
                  <button onClick={prevPage} disabled={currentPage === 1}>
                    Previous
                  </button>
                  <span>
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={nextPage}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="right-column">
          {queue.length > 0 ? (
            <div className="table-container">
              <h2 className="section-title">Print Queue</h2>
              <table className="queue-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Price</th>
                    <th>Qty</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.name}</td>
                      <td>{item.price}</td>
                      <td>{item.qty}</td>
                      <td>
                        <button
                          className="action-btn remove-btn"
                          onClick={() => removeFromQueue(idx)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button className="print-btn" onClick={handlePrint}>
                Print {queue.reduce((acc, item) => acc + item.qty, 0)} Labels
              </button>
            </div>
          ) : (
            <div
              className="table-container"
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                minHeight: "200px",
                color: "var(--text-muted)",
                fontSize: "0.9rem",
              }}
            >
              Your print queue is empty.
            </div>
          )}
        </div>
      </div>

      {showPriceModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Select Price Level</h2>
              <p>{pendingProduct?.prod_name || pendingProduct?.name}</p>
            </div>
            <div className="price-level-list">
              {/* Default Price */}
              <div
                className="price-level-item"
                onClick={() => handlePriceSelect(null)}
              >
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span className="price-level-name">
                    Default Selling Price
                  </span>
                  <span className="price-level-desc">
                    Default price from product record
                  </span>
                </div>
                <span className="price-level-value">
                  {formatPrice(
                    pendingProduct?.selling_price || pendingProduct?.price || 0,
                  )}
                </span>
              </div>

              {isFetchingPriceLevels && (
                <div style={{ textAlign: "center", padding: "1.5rem" }}>
                  <div className="loading-spinner"></div>
                  <p
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "0.85rem",
                      marginTop: "0.5rem",
                    }}
                  >
                    Fetching additional price levels...
                  </p>
                </div>
              )}

              {/* Dynamic Price Levels */}
              {priceLevels.map((level, idx) => {
                const priceValue =
                  level.selling_price ||
                  level.wholesale_price ||
                  level.price ||
                  0;

                return (
                  <div
                    key={level.id || idx}
                    className="price-level-item"
                    onClick={() => handlePriceSelect(level)}
                  >
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span className="price-level-name">
                        {level.name || `Price Level ${idx + 1}`}
                      </span>
                      {level.wholesale_price > 0 && (
                        <span className="price-level-desc">
                          Wholesale: {formatPrice(level.wholesale_price)}
                        </span>
                      )}
                    </div>
                    <span className="price-level-value">
                      {formatPrice(priceValue)}
                    </span>
                  </div>
                );
              })}

              {priceLevels.length === 0 && !isFetchingPriceLevels && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "1rem",
                    color: "var(--text-muted)",
                  }}
                >
                  No additional price levels found.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="cancel-btn"
                onClick={() => setShowPriceModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
