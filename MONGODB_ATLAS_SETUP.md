# MongoDB Atlas Setup Guide

This guide provides step-by-step instructions for setting up MongoDB Atlas for the Student Information Management System.

## Step 1: Create MongoDB Atlas Account

1. Visit [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Click "Try Free" or "Sign In"
3. Choose one of the following:
   - Sign up with Google
   - Sign up with GitHub
   - Sign up with email
4. Complete the registration process
5. Verify your email address if required

## Step 2: Create a New Project

1. After logging in, you'll see the "Projects" section
2. Click "New Project"
3. Enter project name: `Student Management System`
4. (Optional) Add project tags
5. Click "Next"
6. Add members if needed (or skip for now)
7. Click "Create Project"

## Step 3: Create a Cluster

1. In your new project, click "Build a Database"
2. Select "M0 (Free)" for development (or choose a paid tier for production)
3. **Cloud Provider**: Choose AWS, Google Cloud, or Azure
   - Recommendation: Choose the provider closest to your users
4. **Region**: Select a region
   - For Render deployment: Choose a region close to Render's data centers
   - Common choices: us-east-1, eu-west-1, ap-southeast-1
5. **Cluster Name**: Enter `student-cluster`
6. **Cluster Tier**: M0 Free (512MB storage)
7. Click "Create"
8. Wait for cluster creation (2-5 minutes)
   - You'll see a progress indicator
   - You'll receive an email when it's ready

## Step 4: Create Database User

### Critical Step - Do Not Skip!

1. In the left sidebar, click "Database Access"
2. Click "Add New Database User"
3. **Authentication Method**: Select "Password"
4. **Username**: Enter a username (e.g., `student_admin`)
   - Note: This cannot be changed later
5. **Password**: Enter a strong password
   - Must be at least 8 characters
   - Use uppercase, lowercase, numbers, and special characters
   - **IMPORTANT**: Save this password securely - you'll need it for the connection string
6. **Database User Privileges**: Select "Read and write to any database"
7. Click "Add User"

### Password Requirements for Connection String

If your password contains special characters, you MUST URL encode them:
- `@` → `%40`
- `:` → `%3A`
- `/` → `%2F`
- `?` → `%3F`
- `#` → `%23`
- `[` → `%5B`
- `]` → `%5D`
- ` ` (space) → `%20`

Example:
- Password: `My@Pass!123`
- Encoded: `My%40Pass%21123`

## Step 5: Configure Network Access

### For Development

1. In the left sidebar, click "Network Access"
2. Click "Add IP Address"
3. Select "Allow Access from Anywhere"
4. This will add `0.0.0.0/0` to the whitelist
5. Click "Confirm"

### For Production (Recommended)

1. Instead of "Allow Access from Anywhere", add specific IPs:
   - Get Render's IP ranges from: https://render.com/docs/private-network
   - Add each IP range individually
2. Alternatively, use VPC peering for secure connections

## Step 6: Get Connection String

1. In the left sidebar, click "Database"
2. Find your cluster (student-cluster)
3. Click "Connect"
4. Select "Drivers"
5. **Select your driver**: Node.js
6. **Select your version**: 4.1 or later
7. Copy the connection string

The connection string will look like:
```
mongodb+srv://<username>:<password>@student-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

## Step 7: Format Your Connection String

Replace the placeholders:

### Template:
```
mongodb+srv://<username>:<password>@<cluster-url>/<database-name>?retryWrites=true&w=majority
```

### Example:
```
mongodb+srv://student_admin:MySecurePass123@student-cluster.abc123.mongodb.net/studentDB?retryWrites=true&w=majority
```

### Components:
- `<username>`: Your database username (e.g., `student_admin`)
- `<password>`: Your database password (URL encoded if needed)
- `<cluster-url>`: Your cluster URL (e.g., `student-cluster.abc123.mongodb.net`)
- `<database-name>`: Your database name (e.g., `studentDB`)

### Important Notes:
- The database name is what you want to call your database
- It will be created automatically when you first connect
- Common choices: `studentDB`, `student_management`, `students`

## Step 8: Test Connection Locally

### Create Backend .env File

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a `.env` file:
```env
MONGODB_URI=mongodb+srv://student_admin:YourPassword@student-cluster.abc123.mongodb.net/studentDB?retryWrites=true&w=majority
PORT=5000
NODE_ENV=development
```

3. Install dependencies:
```bash
npm install
```

4. Start the server:
```bash
npm run dev
```

5. You should see:
```
MongoDB Connected: student-cluster.xxxxx.mongodb.net
Server running on port 5000
```

If you see connection errors, check the troubleshooting section below.

## Step 9: Verify Database Creation

1. Go to MongoDB Atlas
2. Click "Database" in the left sidebar
3. Click "Browse Collections" on your cluster
4. You should see your database (e.g., `studentDB`)
5. Once you add students, you'll see the `students` collection

## Troubleshooting

### Error: Authentication Failed

**Symptoms:**
```
MongoServerError: Authentication failed
```

**Solutions:**
1. Verify username is correct (case-sensitive)
2. Verify password is correct
3. Check if password needs URL encoding
4. Ensure database user has "Read and write to any database" privileges
5. Try recreating the database user

### Error: Connection Refused

**Symptoms:**
```
MongooseServerSelectionError: connect ECONNREFUSED
```

**Solutions:**
1. Check Network Access settings
2. Ensure IP whitelist includes 0.0.0.0/0 or your IP
3. Verify cluster is active (not paused)
4. Check if cluster is in the same region as your app
5. Try using a VPN if you're behind a corporate firewall

### Error: Connection Timeout

**Symptoms:**
```
MongoTimeoutError: Server selection timed out
```

**Solutions:**
1. Check cluster status in MongoDB Atlas
2. Verify your internet connection
3. Check DNS resolution of cluster URL
4. Try pinging the cluster URL
5. Check firewall settings
6. Ensure Node.js version is compatible

### Error: Invalid Connection String

**Symptoms:**
```
MongoParseError: Invalid connection string
```

**Solutions:**
1. Ensure connection string starts with `mongodb+srv://`
2. Check for extra spaces or line breaks
3. Verify all placeholders are replaced
4. Ensure database name is included
5. Check for special characters in password (URL encode them)

### Error: IP Not Whitelisted

**Symptoms:**
```
MongoServerError: bad auth Authentication failed
```

**Solutions:**
1. Go to Network Access in MongoDB Atlas
2. Add your current IP address
3. Or add 0.0.0.0/0 for development
4. Wait 1-2 minutes for changes to propagate

## Security Best Practices

### For Development:
- Use 0.0.0.0/0 in Network Access
- Use strong passwords
- Don't commit .env files
- Rotate passwords periodically

### For Production:
- Use specific IP addresses only
- Enable VPC peaching if possible
- Use encryption at rest (Atlas Security)
- Enable audit logging
- Use strong authentication (SCRAM)
- Enable IP whitelisting
- Use TLS/SSL for all connections
- Regular security audits

## Monitoring and Maintenance

### Check Cluster Status:
1. Go to "Metrics" in MongoDB Atlas
2. Monitor CPU, memory, and storage
3. Set up alerts for unusual activity

### Backup Strategy:
- M0 Free tier: No automated backups
- Paid tiers: Enable automated backups
- Consider manual exports for critical data

### Scaling:
- M0 Free: 512MB storage
- M2/M5: For small production apps
- M10+: For larger applications

## Cost Considerations

### Free Tier (M0):
- 512MB storage
- Shared RAM
- No backups
- Good for development

### Paid Tiers:
- M2/M5: Starting at $9/month
- M10+: Starting at $57/month
- Includes backups and better performance

## Next Steps

After completing MongoDB Atlas setup:

1. Test the connection locally
2. Deploy backend to Render
3. Add MONGODB_URI to Render environment variables
4. Deploy frontend to Vercel
5. Test end-to-end functionality
6. Monitor database performance

## Additional Resources

- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [Connection String Guide](https://docs.mongodb.com/manual/reference/connection-string/)
- [Security Best Practices](https://docs.atlas.mongodb.com/security/)
- [Render MongoDB Guide](https://render.com/docs/deploy-mongodb-atlas)
- [Node.js Driver Documentation](https://mongodb.github.io/node-mongodb-native/)

## Need Help?

If you encounter issues:
1. Check MongoDB Atlas status page
2. Review cluster logs in Atlas
3. Check Render logs for backend errors
4. Verify environment variables
5. Test connection string with MongoDB Compass
