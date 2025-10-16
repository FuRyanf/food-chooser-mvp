# Vercel Deployment Checklist ✅

Use this checklist to ensure your FuDi app deploys successfully to Vercel.

## Pre-Deployment Requirements

### ✅ Supabase Setup
- [ ] Supabase project created and configured
- [ ] Database schema applied (`supabase-schema.sql`)
- [ ] Supabase URL and anon key available
- [ ] Test app locally with Supabase connection

### ✅ Code Repository  
- [ ] All code committed to Git
- [ ] Repository pushed to GitHub/GitLab/Bitbucket
- [ ] No sensitive data in repository (check `.env.local` is gitignored)

## Vercel Deployment Steps

### ✅ Project Setup
- [ ] Vercel account created
- [ ] Repository imported to Vercel
- [ ] Framework detected as "Vite" (should be automatic)

### ✅ Environment Variables
**Critical:** App will not work without these!

- [ ] `VITE_SUPABASE_URL` added to Vercel environment variables
- [ ] `VITE_SUPABASE_ANON_KEY` added to Vercel environment variables  
- [ ] Values match your Supabase project settings
- [ ] Variables applied to "Production" environment

### ✅ Build Configuration
- [ ] `vercel.json` file exists in project root
- [ ] Build command set to: `npm run build` (should be automatic)
- [ ] Output directory set to: `dist` (should be automatic)
- [ ] Node.js version compatible (18.x or higher recommended)

## Post-Deployment Testing

### ✅ Basic Functionality
- [ ] App loads without errors
- [ ] No console errors in browser dev tools
- [ ] Supabase connection working (check network tab)
- [ ] "Surprise Me" button generates meals
- [ ] Meal history displays correctly

### ✅ SPA Routing
- [ ] Direct URL access works (e.g., `/settings`)
- [ ] Page refresh works on any route
- [ ] No 404 errors when navigating

### ✅ Performance
- [ ] Initial page load under 3 seconds
- [ ] Assets loading from CDN
- [ ] Lighthouse score > 90 (optional)

## Troubleshooting Common Issues

### Build Failures
- **TypeScript errors**: Run `npm run build` locally to identify issues
- **Missing dependencies**: Check `package.json` includes all required packages
- **Node version**: Ensure compatible Node.js version in Vercel settings

### Runtime Errors
- **Supabase connection failed**: Verify environment variables are correct
- **404 on page refresh**: Check `vercel.json` rewrites configuration
- **Console errors**: Check browser developer tools for specific error messages

### Environment Variables
- **Variables not found**: Ensure they're added to Vercel project settings
- **Wrong values**: Double-check against Supabase dashboard
- **Caching issues**: Redeploy after changing environment variables

## Success Criteria ✨

Your deployment is successful when:
- ✅ App loads instantly from your Vercel URL
- ✅ All features work identically to local development  
- ✅ No console errors or network failures
- ✅ Direct URL access works for all routes
- ✅ Database operations (meals, preferences) function correctly

## Next Steps

After successful deployment:
- [ ] Set up custom domain (optional)
- [ ] Configure branch-specific deployments (optional)
- [ ] Set up monitoring/analytics (optional)
- [ ] Document live URL for team access

---

**Need Help?** 
- Check the [main README.md](./README.md) for detailed instructions
- Review Vercel deployment logs in dashboard
- Test locally first: `npm run build && npm run preview`
