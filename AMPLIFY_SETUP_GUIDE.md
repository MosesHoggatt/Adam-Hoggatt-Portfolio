# AWS Amplify Setup Guide

This guide will help you configure AWS Amplify for your portfolio website.

## Prerequisites

- AWS Account (create one at https://aws.amazon.com if you don't have one)
- Node.js and npm installed
- This project already has the code ready

## Step-by-Step Setup

### Step 1: Install Amplify CLI

Open your terminal and run:

```bash
npm install -g @aws-amplify/cli
```

### Step 2: Configure Amplify CLI with your AWS Account

```bash
amplify configure
```

This will:
1. Open your browser to sign in to AWS Console
2. Create an IAM user for Amplify
3. Save your credentials locally

Follow the prompts:
- **Region**: Choose the AWS region closest to you (e.g., `us-east-1`)
- **User name**: `amplify-dev` (or any name you prefer)
- After the IAM user is created, you'll get an Access Key ID and Secret Access Key
- Enter these when prompted

### Step 3: Initialize Amplify in Your Project

In your project directory, run:

```bash
amplify init
```

Answer the prompts:
- **Enter a name for the project**: `AdamHoggatPortfolio`
- **Enter a name for the environment**: `dev`
- **Choose your default editor**: (choose your editor, e.g., Visual Studio Code)
- **Choose the type of app**: `javascript`
- **What javascript framework**: `react`
- **Source Directory Path**: `src`
- **Distribution Directory Path**: `dist`
- **Build Command**: `npm run build`
- **Start Command**: `npm run dev`
- **Do you want to use an AWS profile?**: `Yes`
- Select the profile you created in Step 2

### Step 4: Add Authentication

```bash
amplify add auth
```

Choose:
- **Do you want to use the default authentication**: `Default configuration`
- **How do you want users to sign in?**: `Email`
- **Do you want to configure advanced settings?**: `No, I am done.`

### Step 5: Add Storage

```bash
amplify add storage
```

Choose:
- **Select from one of the below mentioned services**: `Content (Images, audio, video, etc.)`
- **Provide a friendly name**: `projectStorage`
- **Provide bucket name**: (press Enter to use default)
- **Who should have access**: `Auth users only`
- **What kind of access do you want for Authenticated users?**: 
  - Select: `create/update`, `read`, `delete`
- **Do you want to add a Lambda Trigger?**: `No`

### Step 6: Deploy Your Backend

```bash
amplify push
```

This will:
- Create your Cognito User Pool (for authentication)
- Create your S3 bucket (for storage)
- Generate the `aws-exports.js` configuration file

Answer:
- **Are you sure you want to continue?**: `Yes`

Wait for the deployment to complete (this may take 5-10 minutes).

### Step 7: Configure S3 Bucket for Public Access

After `amplify push` completes:

1. Go to AWS S3 Console: https://s3.console.aws.amazon.com
2. Find your bucket (name will be shown in terminal after push)
3. Click on the bucket name
4. Go to **Permissions** tab
5. Edit **Bucket Policy** and add:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/public/projects/*"
    }
  ]
}
```

Replace `YOUR-BUCKET-NAME` with your actual bucket name.

6. Edit **CORS configuration** and add:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

### Step 8: Test Your Setup

Run the development server:

```bash
npm run dev
```

1. Open http://localhost:5173
2. Navigate to `/admin`
3. Create a new account:
   - Click "Create Account"
   - Enter your email and password
   - Check your email for verification code
   - Enter the verification code
4. Sign in
5. Try uploading a test project!

## Quick Reference Commands

```bash
# Check Amplify status
amplify status

# Pull latest backend changes
amplify pull

# View Amplify console (web interface)
amplify console

# Add new Amplify category
amplify add <category>

# Update existing category
amplify update <category>

# Remove a category
amplify remove <category>

# Deploy changes
amplify push

# Delete all backend resources (BE CAREFUL!)
amplify delete
```

## Troubleshooting

### Issue: "aws-exports.js not found"
**Solution**: Run `amplify push` to generate the configuration file.

### Issue: "Access Denied" when uploading
**Solution**: 
1. Check that you're signed in
2. Verify Storage permissions: `amplify update storage`
3. Make sure authenticated users have create/update/read/delete access

### Issue: Images not showing on public page
**Solution**:
1. Verify S3 bucket policy allows public read for `projects/*`
2. Check CORS configuration in S3

### Issue: Can't sign up or verify email
**Solution**:
1. Check spam folder for verification email
2. Verify Cognito User Pool settings: `amplify console auth`
3. Make sure email verification is enabled

## Need Help?

- AWS Amplify Documentation: https://docs.amplify.aws/
- Amplify CLI Reference: https://docs.amplify.aws/cli/
- AWS Support: https://console.aws.amazon.com/support/

## Cost Information

AWS Amplify has a generous free tier:
- **Cognito**: 50,000 monthly active users (free)
- **S3**: 5GB storage, 20,000 GET requests, 2,000 PUT requests (free tier for 12 months)
- After free tier, costs are minimal for a portfolio site (typically $1-5/month)

## Security Best Practices

1. **Never commit aws-exports.js to public repositories** (it's in .gitignore)
2. Use strong passwords for admin accounts
3. Enable MFA (Multi-Factor Authentication) for extra security
4. Regularly review IAM permissions
5. Monitor AWS CloudWatch for unusual activity
