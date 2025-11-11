const API_BASE_URL = 'http://localhost:5000/api';
const STORAGE_KEY = 'price_comparison_history';

let priceChart = null;
let currentProducts = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const searchBtn = document.getElementById('searchBtn');
    const searchInput = document.getElementById('searchInput');

    searchBtn.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });
});

async function handleSearch() {
    const query = document.getElementById('searchInput').value.trim();
    
    if (!query) {
        showError('Please enter a product name to search');
        return;
    }

    showLoading(true);
    hideError();
    hideResults();

    try {
        const response = await fetch(`${API_BASE_URL}/search?query=${encodeURIComponent(query)}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        currentProducts = data.products || [];

        if (currentProducts.length === 0) {
            showError('No products found. Please try a different search term.');
            showLoading(false);
            return;
        }

        displayProducts(currentProducts);
        saveToHistory(query, currentProducts);
        showResults();
        showLoading(false);
    } catch (error) {
        console.error('Search error:', error);
        showError(`Error searching products: ${error.message}. Make sure the backend server is running on port 5000.`);
        showLoading(false);
    }
}

function displayProducts(products) {
    const productList = document.getElementById('productList');
    productList.innerHTML = '';

    products.forEach((product, index) => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.dataset.index = index;
        
        // Get image from any available platform
        const imageUrl = Object.values(product.prices || {})
            .map(p => p.image)
            .find(img => img) || 'https://via.placeholder.com/200?text=No+Image';

        const platforms = ['flipkart', 'amazon', 'reliance', 'croma'];
        const priceItems = platforms.map(platform => {
            const priceData = product.prices[platform];
            if (priceData && priceData.price > 0) {
                return `
                    <div class="price-item">
                        <span class="platform-name">${platform}</span>
                        <span class="platform-price">₹${formatPrice(priceData.price)}</span>
                    </div>
                `;
            }
            return `
                <div class="price-item">
                    <span class="platform-name">${platform}</span>
                    <span class="no-price">Not available</span>
                </div>
            `;
        }).join('');

        // Find the best price (lowest available)
        const availablePrices = Object.entries(product.prices || {})
            .filter(([_, data]) => data && data.price > 0)
            .map(([platform, data]) => ({ platform, price: data.price, url: data.url }));
        
        const bestPrice = availablePrices.length > 0 
            ? availablePrices.reduce((min, p) => p.price < min.price ? p : min)
            : null;

        card.innerHTML = `
            <img src="${imageUrl}" alt="${product.name}" onerror="this.src='https://via.placeholder.com/200?text=No+Image'" />
            <h4>${product.name}</h4>
            <div class="product-prices">
                ${priceItems}
            </div>
            ${bestPrice ? `<a href="${bestPrice.url}" target="_blank" rel="noopener noreferrer" class="product-link" onclick="event.stopPropagation();">Best Price: ₹${formatPrice(bestPrice.price)}</a>` : ''}
        `;

        card.addEventListener('click', () => {
            selectProduct(index);
        });

        productList.appendChild(card);
    });
}

function selectProduct(index) {
    // Remove previous selection
    document.querySelectorAll('.product-card').forEach(card => {
        card.classList.remove('selected');
    });

    // Select current product
    const card = document.querySelector(`[data-index="${index}"]`);
    if (card) {
        card.classList.add('selected');
    }

    const product = currentProducts[index];
    if (product) {
        displayComparison(product);
        displayGraph(product);
    }
}

function displayComparison(product) {
    const comparisonSection = document.getElementById('comparisonSection');
    const comparisonTable = document.getElementById('comparisonTable');
    
    comparisonSection.style.display = 'block';

    const platforms = [
        { key: 'flipkart', name: 'Flipkart' },
        { key: 'amazon', name: 'Amazon' },
        { key: 'reliance', name: 'Reliance Digital' },
        { key: 'croma', name: 'Croma' }
    ];

    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>Platform</th>
                    <th>Price</th>
                    <th>Link</th>
                </tr>
            </thead>
            <tbody>
    `;

    platforms.forEach(platform => {
        const priceData = product.prices[platform.key];
        if (priceData && priceData.price > 0) {
            tableHTML += `
                <tr>
                    <td>${platform.name}</td>
                    <td class="price-cell">₹${formatPrice(priceData.price)}</td>
                    <td><a href="${priceData.url || '#'}" target="_blank" rel="noopener noreferrer">View Product</a></td>
                </tr>
            `;
        } else {
            tableHTML += `
                <tr>
                    <td>${platform.name}</td>
                    <td class="price-cell na">Not Available</td>
                    <td>-</td>
                </tr>
            `;
        }
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    comparisonTable.innerHTML = tableHTML;
}

function displayGraph(product) {
    const graphSection = document.getElementById('graphSection');
    graphSection.style.display = 'block';

    // Get historical data from localStorage
    const history = getHistory();
    const productKey = product.model || product.name;
    
    // Get today's prices
    const today = new Date().toISOString().split('T')[0];
    const platforms = ['flipkart', 'amazon', 'reliance', 'croma'];
    
    // Collect all dates (historical + today)
    let allDates = [today];
    if (history[productKey]) {
        const historicalDates = Object.keys(history[productKey]).filter(date => date !== today);
        allDates = [...historicalDates, today];
    }
    
    // Sort dates chronologically and limit to 30 days
    allDates.sort();
    allDates = allDates.slice(-30);
    
    // Build datasets
    const datasets = platforms.map(platform => {
        const data = allDates.map(date => {
            if (date === today) {
                // Use current price from product
                const priceData = product.prices[platform];
                return priceData && priceData.price > 0 ? priceData.price : null;
            } else {
                // Use historical price
                return history[productKey]?.[date]?.[platform] || null;
            }
        });
        
        return {
            label: platform.charAt(0).toUpperCase() + platform.slice(1),
            data: data,
            borderColor: getPlatformColor(platform),
            backgroundColor: getPlatformColor(platform, 0.1),
            tension: 0.1,
            fill: false
        };
    });

    // Destroy existing chart if it exists
    const ctx = document.getElementById('priceChart');
    if (priceChart) {
        priceChart.destroy();
    }

    // Create new chart
    priceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: allDates,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `Price Trend: ${product.name}`
                },
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) {
                            return '₹' + formatPrice(value);
                        }
                    }
                }
            }
        }
    });
}

function saveToHistory(query, products) {
    const history = getHistory();
    const today = new Date().toISOString().split('T')[0];

    products.forEach(product => {
        const productKey = product.model || product.name;
        
        if (!history[productKey]) {
            history[productKey] = {};
        }

        if (!history[productKey][today]) {
            history[productKey][today] = {};
        }

        const platforms = ['flipkart', 'amazon', 'reliance', 'croma'];
        platforms.forEach(platform => {
            const priceData = product.prices[platform];
            if (priceData && priceData.price > 0) {
                history[productKey][today][platform] = priceData.price;
            }
        });
    });

    // Clean up old data (keep only last 30 days)
    Object.keys(history).forEach(productKey => {
        const dates = Object.keys(history[productKey]).sort();
        if (dates.length > 30) {
            dates.slice(0, dates.length - 30).forEach(date => {
                delete history[productKey][date];
            });
        }
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

function getHistory() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (e) {
        return {};
    }
}

function getPlatformColor(platform, alpha = 1) {
    const colors = {
        flipkart: `rgba(40, 116, 240, ${alpha})`,      // Flipkart blue
        amazon: `rgba(255, 153, 0, ${alpha})`,         // Amazon orange
        reliance: `rgba(0, 102, 204, ${alpha})`,       // Reliance blue
        croma: `rgba(220, 38, 38, ${alpha})`           // Croma red
    };
    return colors[platform] || `rgba(102, 126, 234, ${alpha})`;
}

function formatPrice(price) {
    if (!price) return '0';
    return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function showLoading(show) {
    document.getElementById('loadingIndicator').style.display = show ? 'block' : 'none';
}

function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}

function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function showResults() {
    document.getElementById('resultsSection').style.display = 'block';
}

function hideResults() {
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('comparisonSection').style.display = 'none';
    document.getElementById('graphSection').style.display = 'none';
}

async function searchProduct() {
  const query = document.getElementById('searchBox').value;
  const res = await fetch(`/search?q=${encodeURIComponent(query)}`);
  const data = await res.json();

  const resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML = '';

  if (data.length === 0) {
    resultsDiv.innerHTML = '<p>No products found.</p>';
    return;
  }

  data.forEach(product => {
    const div = document.createElement('div');
    div.className = 'product';
    div.innerHTML = `
      <h3>${product.name}</h3>
      <p><strong>Vendor:</strong> ${product.vendor}</p>
      <p><strong>Price:</strong> ₹${product.price}</p>
      <a href="${product.link}" target="_blank">View Product</a>
    `;
    resultsDiv.appendChild(div);
  });
}


let sidenav = document.querySelector(".side-navbar");
function shownavbar(){
    sidenav.style.left = "0";
}
function closenavbar(){
    sidenav.style.left = "-50%";
}

//Back
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
const backgroundContainer = document.querySelector('.animated-background');
backgroundContainer.appendChild(canvas);

let width, height;
const dots = [];
const numDots = 200;

function resizeCanvas() {
    // Set canvas dimensions to match the window size for responsiveness
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    createDots(); // Re-create the dots so they are distributed correctly
}

function createDots() {
    dots.length = 0; // Clear existing dots
    for (let i = 0; i < numDots; i++) {
        dots.push({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: Math.random() * 2 + 1,
            vx: Math.random() * 0.5 - 0.25,
            vy: Math.random() * 0.5 - 0.25,
            color: 'rgba(50, 150, 255, 0.8)'
        });
    }
}

function drawDots() {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < numDots; i++) {
        const dot1 = dots[i];
        for (let j = i + 1; j < numDots; j++) {
            const dot2 = dots[j];
            const dx = dot1.x - dot2.x;
            const dy = dot1.y - dot2.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 100) {
                ctx.beginPath();
                ctx.moveTo(dot1.x, dot1.y);
                ctx.lineTo(dot2.x, dot2.y);
                ctx.strokeStyle = `rgba(50, 150, 255, ${1 - distance / 100})`;
                ctx.stroke();
            }
        }
    }

    for (const dot of dots) {
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
        ctx.fillStyle = dot.color;
        ctx.fill();
    }
}

function updateDots() {
    for (const dot of dots) {
        dot.x += dot.vx;
        dot.y += dot.vy;

        if (dot.x > width) dot.x = 0;
        if (dot.x < 0) dot.x = width;
        if (dot.y > height) dot.y = 0;
        if (dot.y < 0) dot.y = height;
    }
}

function animate() {
    updateDots();
    drawDots();
    requestAnimationFrame(animate);
}

// Event listeners to handle responsiveness
window.addEventListener('resize', resizeCanvas);

// Initial setup
resizeCanvas();
animate();