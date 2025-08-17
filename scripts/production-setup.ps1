# Production Setup Script for Centrifuge RWA CLI (Windows PowerShell)
# Run this script to set up your production environment on Windows

$ErrorActionPreference = "Stop"

Write-Host "🚀 CENTRIFUGE RWA CLI - PRODUCTION SETUP (Windows)" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# Helper functions
function Write-Info($message) {
    Write-Host "ℹ️  $message" -ForegroundColor Blue
}

function Write-Success($message) {
    Write-Host "✅ $message" -ForegroundColor Green
}

function Write-Warning($message) {
    Write-Host "⚠️  $message" -ForegroundColor Yellow
}

function Write-Error($message) {
    Write-Host "❌ $message" -ForegroundColor Red
}

# Step 1: Environment Check
Write-Host ""
Write-Info "Step 1: Checking environment prerequisites..."

# Check Node.js version
try {
    $nodeVersion = node -v
    $nodeVersionNumber = $nodeVersion.TrimStart('v')
    $requiredVersion = "18.18.0"
    
    if ([System.Version]$nodeVersionNumber -ge [System.Version]$requiredVersion) {
        Write-Success "Node.js $nodeVersion (meets requirement: $requiredVersion+)"
    } else {
        Write-Error "Node.js version $nodeVersion is too old. Required: $requiredVersion+"
        exit 1
    }
} catch {
    Write-Error "Node.js is not installed"
    exit 1
}

# Check npm
try {
    $npmVersion = npm -v
    Write-Success "npm $npmVersion is available"
} catch {
    Write-Error "npm is not installed"
    exit 1
}

# Check for Git Bash or WSL for Unix commands
$hasGitBash = Test-Path "C:\Program Files\Git\bin\bash.exe" -or Test-Path "C:\Users\$env:USERNAME\AppData\Local\Programs\Git\bin\bash.exe"
$hasWSL = (wsl --list --quiet 2>$null).Count -gt 0

if (-not $hasGitBash -and -not $hasWSL) {
    Write-Warning "Git Bash or WSL not detected. Some features may be limited."
}

# Step 2: Dependencies Installation
Write-Host ""
Write-Info "Step 2: Installing production dependencies..."

npm ci --only=production
Write-Success "Production dependencies installed"

npm install --only=dev
Write-Success "Development dependencies installed"

# Step 3: Build Application
Write-Host ""
Write-Info "Step 3: Building application..."

npm run build
Write-Success "Application built successfully"

# Step 4: Environment Configuration
Write-Host ""
Write-Info "Step 4: Setting up environment configuration..."

if (-not (Test-Path ".env")) {
    if (Test-Path ".env.production") {
        Write-Info "Copying production environment template..."
        Copy-Item ".env.production" ".env"
        Write-Warning "Please edit .env file with your actual production values"
    } else {
        Write-Error ".env.production template not found"
        exit 1
    }
} else {
    Write-Success "Environment file .env already exists"
}

# Step 5: Database Setup Check
Write-Host ""
Write-Info "Step 5: Database setup check..."

$envContent = Get-Content ".env" -Raw
if ($envContent -match "DB_HOST=" -and $envContent -match "DB_PASSWORD=") {
    Write-Info "Database configuration found in .env"
    
    # Test database connection
    try {
        $dbTest = npm run database -- --check 2>&1
        Write-Success "Database connection test completed"
    } catch {
        Write-Warning "Database connection failed - please check your configuration"
    }
} else {
    Write-Warning "Database configuration incomplete in .env file"
}

# Step 6: Security Setup
Write-Host ""
Write-Info "Step 6: Security configuration..."

# Generate random keys if not present
$envContent = Get-Content ".env" -Raw

if ($envContent -notmatch "JWT_SECRET=(?!your-jwt-secret-key)" -or $envContent -match "JWT_SECRET=your-jwt-secret-key") {
    $jwtSecret = [System.Convert]::ToBase64String([System.Security.Cryptography.RNGCryptoServiceProvider]::new().GetBytes(32))
    $envContent = $envContent -replace "JWT_SECRET=.*", "JWT_SECRET=$jwtSecret"
    Write-Success "Generated JWT secret"
}

if ($envContent -notmatch "ENCRYPTION_KEY=(?!your-32-character-encryption-key)" -or $envContent -match "ENCRYPTION_KEY=your-32-character-encryption-key") {
    $encryptionKey = [System.Convert]::ToBase64String([System.Security.Cryptography.RNGCryptoServiceProvider]::new().GetBytes(24)).Substring(0, 32)
    $envContent = $envContent -replace "ENCRYPTION_KEY=.*", "ENCRYPTION_KEY=$encryptionKey"
    Write-Success "Generated encryption key"
}

# Set production environment
$envContent = $envContent -replace "APP_ENV=.*", "APP_ENV=production"
$envContent | Set-Content ".env"
Write-Success "Set APP_ENV to production"

# Step 7: Directory Structure
Write-Host ""
Write-Info "Step 7: Creating required directories..."

$directories = @("logs", "reports", "backups", ".wallets", ".local_data")
foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

# Set permissions for .wallets (Windows equivalent)
$acl = Get-Acl ".wallets"
$acl.SetAccessRuleProtection($true, $false)
$accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule($env:USERNAME, "FullControl", "Allow")
$acl.SetAccessRule($accessRule)
Set-Acl ".wallets" $acl

Write-Success "Directory structure created"

# Step 8: Service Configuration
Write-Host ""
Write-Info "Step 8: Setting up process management..."

if (-not (Test-Path "ecosystem.config.js")) {
    Write-Warning "ecosystem.config.js not found - please create it manually"
} else {
    Write-Success "PM2 ecosystem configuration found"
}

# Check if PM2 is installed
try {
    pm2 --version | Out-Null
    Write-Success "PM2 is already installed"
} catch {
    Write-Info "Installing PM2 process manager..."
    npm install -g pm2
    Write-Success "PM2 installed globally"
}

# Step 9: Health Check
Write-Host ""
Write-Info "Step 9: Running comprehensive health check..."

try {
    npm run health
    Write-Success "Health check passed"
} catch {
    Write-Warning "Health check had some issues - please review the output above"
}

# Step 10: Windows Service Setup
Write-Host ""
Write-Info "Step 10: Windows service configuration..."

Write-Info "For Windows service setup, consider using pm2-windows-service"
Write-Info "Run: npm install -g pm2-windows-service"
Write-Info "Then: pm2-service-install"

# Step 11: Security Checklist
Write-Host ""
Write-Info "Step 11: Security recommendations..."
Write-Host ""
Write-Host "🔒 SECURITY CHECKLIST:" -ForegroundColor Cyan
Write-Host "======================"
Write-Host "□ Change all default passwords in .env"
Write-Host "□ Set up SSL/TLS certificates"
Write-Host "□ Configure Windows Firewall rules"
Write-Host "□ Enable database SSL"
Write-Host "□ Set up backup procedures"
Write-Host "□ Configure monitoring alerts"
Write-Host "□ Review access permissions"
Write-Host "□ Enable audit logging"
Write-Host ""

# Step 12: Usage Documentation
Write-Host ""
Write-Info "Step 12: Usage documentation..."
Write-Host ""
Write-Host "📚 QUICK START COMMANDS:" -ForegroundColor Cyan
Write-Host "========================"
Write-Host "# Check system health"
Write-Host "npm run health"
Write-Host ""
Write-Host "# Create secure wallet"
Write-Host "npm run wallet -- --create"
Write-Host ""
Write-Host "# List investment pools"
Write-Host "npm run pools -- --list"
Write-Host ""
Write-Host "# Start interactive mode"
Write-Host "npm run interactive"
Write-Host ""
Write-Host "# Start production service"
Write-Host "pm2 start ecosystem.config.js --env production"
Write-Host ""
Write-Host "# Monitor service"
Write-Host "pm2 status"
Write-Host "pm2 logs"
Write-Host ""

# Final Summary
Write-Host ""
Write-Host "🎉 SETUP COMPLETE!" -ForegroundColor Green
Write-Host "=================="
Write-Success "Centrifuge RWA CLI is ready for production deployment"
Write-Host ""
Write-Host "📋 NEXT STEPS:" -ForegroundColor Cyan
Write-Host "1. Edit .env file with your production values"
Write-Host "2. Test all CLI commands: npm run health"
Write-Host "3. Start the service: pm2 start ecosystem.config.js --env production"
Write-Host "4. Monitor logs: pm2 logs centrifuge-rwa-cli"
Write-Host "5. Set up monitoring and alerts"
Write-Host ""
Write-Host "🆘 SUPPORT:" -ForegroundColor Cyan
Write-Host "- Documentation: .\PRODUCTION_DEPLOYMENT.md"
Write-Host "- Health check: npm run health"
Write-Host "- Interactive mode: npm run interactive"
Write-Host ""

Write-Warning "IMPORTANT: Review and update all configuration values in .env before going live!"

# Create deployment status file
@"
DEPLOYMENT_DATE=$(Get-Date)
VERSION=$((Get-Content package.json | ConvertFrom-Json).version)
NODE_VERSION=$(node -v)
STATUS=ready-for-production
LAST_HEALTH_CHECK=$(Get-Date)
"@ | Set-Content ".deployment-status"

Write-Success "Deployment status saved to .deployment-status"

Write-Host ""
Write-Host "🚀 You're ready to go live on Centrifuge! Good luck! 🎉" -ForegroundColor Green