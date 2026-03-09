# Adam Hoggatt Portfolio

A static React portfolio website with AWS Amplify authentication and S3 storage for managing projects dynamically.

## Features

- **Public Portfolio**: Display projects fetched from S3 storage
- **Protected Admin Dashboard**: Secure admin section for uploading new projects
- **AWS Amplify Integration**: Authentication (Cognito) and Storage (S3)
- **React Router**: Client-side routing for public and admin pages
- **Drag & Drop Upload**: User-friendly interface for uploading project images

## Tech Stack

- React 18 with Vite
- AWS Amplify (Authentication & Storage)
- React Router v6
- @aws-amplify/ui-react for authentication UI

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure AWS Amplify

**IMPORTANT**: You mentioned that AWS Amplify is already configured with `amplify add auth` and `amplify add storage`. If you have already run these commands, skip to step 3.

If you haven't configured Amplify yet:

```bash
# Install Amplify CLI globally (if not already installed)
npm install -g @aws-amplify/cli

# Initialize Amplify in your project
amplify init

# Add authentication
amplify add auth
# Choose: Default configuration with username
# Sign-in method: Email
# Configure advanced settings: No, I am done

# Add storage
amplify add storage
# Choose: Content (Images, audio, video, etc.)
# Provide a friendly name: projectStorage
# Provide bucket name: (use default or custom)
# Who should have access: Auth users only
# What kind of access: read/write
# Add a Lambda Trigger: No

# Push changes to AWS
amplify push
```

### 3. Update aws-exports.js

After running `amplify push`, a real `aws-exports.js` file will be generated in your `src/` directory. The placeholder file created will be automatically replaced.

If you need to manually update it, edit `src/aws-exports.js` with your AWS configuration values.

### 4. Configure S3 Storage Permissions

Make sure your S3 bucket has the correct permissions for public read access on project files:

1. Go to AWS S3 Console
2. Find your Amplify storage bucket
3. Under "Permissions" > "Bucket Policy", ensure public read access for the `projects/` folder

Example policy (add to existing policy):
```json
{
  "Effect": "Allow",
  "Principal": "*",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/public/projects/*"
}
```

### 5. Run Development Server

```bash
npm run dev
```

The app will open at `http://localhost:5173`

## Usage

### Public Portfolio
- Visit `/` to see the public portfolio
- Projects are dynamically loaded from S3 storage
- No authentication required

### Admin Dashboard
- Visit `/admin` to access the admin dashboard
- You'll be prompted to sign in or create an account
- Once authenticated, you can:
  - Upload new projects with images
  - View all existing projects
  - Delete projects

### First Time Admin Setup
1. Navigate to `/admin`
2. Click "Create Account" tab
3. Enter email and password
4. Verify your email (check spam folder)
5. Sign in and start uploading projects

## Development Workflow

- **Always commit and push** your changes to the `dev` branch when you finish any modification.  
  This repo uses `dev` as the active development branch; do not push directly to `main`/`master` unless explicitly instructed.
- Run `npm run build` to verify there are no compile errors before committing.
- The site is static, so pushing to `dev` will make the new sources available for deployment pipelines.  
- Use scripts in `scripts/` (e.g. `upload.mjs`, `generate-thumbnails.mjs`) as needed when adding or updating images.

## Project Structure

```
src/
├── components/
│   ├── AdminDashboard.jsx    # Protected admin interface
│   ├── AdminDashboard.css
│   ├── Portfolio.jsx          # Public portfolio page
│   └── Portfolio.css
├── routes/
│   └── ProtectedRoute.jsx     # Route protection wrapper
├── App.jsx                     # Main app with routing
├── aws-exports.js              # Amplify configuration
└── main.jsx                    # Entry point
```

## Storage Structure in S3

```
public/
└── projects/
    ├── project-slug-1.json           # Project metadata
    ├── project-slug-1/
    │   └── images/
    │       ├── image-1.jpg
    │       └── image-2.jpg
    ├── project-slug-2.json
    └── project-slug-2/
        └── images/
            └── image-1.jpg
```

## Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory, ready for deployment to AWS Amplify hosting, S3, or any static hosting service.

## Deployment to AWS Amplify

1. Go to AWS Amplify Console
2. Connect your Git repository
3. Amplify will automatically detect the build settings
4. Deploy!

Build settings (if needed):
```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

## Troubleshooting

### "Cannot find module './aws-exports'"
- Run `amplify init` and `amplify push` to generate the configuration file
- Make sure `aws-exports.js` exists in the `src/` directory

### Authentication not working
- Verify your Cognito User Pool is created: `amplify status`
- Check that `aws-exports.js` has the correct user pool ID and client ID
- Clear browser cache and cookies

### Images not displaying
- Check S3 bucket CORS configuration
- Verify bucket policy allows public read for `projects/` folder
- Ensure images were uploaded with `level: 'public'`

### "Access Denied" errors
- Review IAM policies for authenticated users
- Check that Storage was configured with read/write access for auth users

## License

All rights reserved.