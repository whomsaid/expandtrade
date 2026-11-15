import { Link } from 'react-router-dom';
import { Mail, MapPin, Phone } from 'lucide-react';
import { usePlatformConfig } from '../context/PlatformConfigContext.jsx';
import BrandLogo from './BrandLogo.jsx';

export default function PublicFooter() {
  const { config } = usePlatformConfig();

  const socialLinks = [
    { label: 'LinkedIn', url: config.social_linkedin_url },
    { label: 'X', url: config.social_x_url },
    { label: 'Instagram', url: config.social_instagram_url },
    { label: 'Facebook', url: config.social_facebook_url },
  ].filter((item) => Boolean(item.url && item.url.trim()));

  return (
    <footer className="bg-[#0B192C] text-slate-300 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-6 py-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-4 space-y-3.5">
          <Link to="/" className="inline-block text-lg font-bold text-white tracking-tight">
            <BrandLogo
              textClassName="text-lg font-bold text-white tracking-tight"
              imgClassName="h-8 w-auto max-w-[140px] object-contain shrink-0"
            />
          </Link>
          <p className="text-sm text-slate-400 max-w-sm leading-relaxed">
            One unified SaaS workspace to manage business operations, sales, inventory, customers,
            employees, branches, and financial records across Rwanda and Africa.
          </p>
          <div className="space-y-1.5 text-xs text-slate-400 pt-1">
            {config.platform_location && (
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>{config.platform_location}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <a href={`mailto:${config.support_email || 'support@bizflow.africa'}`} className="hover:text-white transition-colors">
                {config.support_email || 'support@bizflow.africa'}
              </a>
            </div>
            {config.support_phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="tabular-nums">{config.support_phone}</span>
              </div>
            )}
          </div>
          {socialLinks.length > 0 && (
            <div className="flex flex-wrap items-center gap-4 pt-2 text-xs">
              {socialLinks.map((s) => (
                <a
                  key={s.label}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-white transition-colors underline underline-offset-4"
                >
                  {s.label}
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-3">
          <div className="text-xs font-semibold text-white">Navigation</div>
          <ul className="space-y-2 text-sm text-slate-400">
            <li><Link to="/" className="hover:text-white transition-colors">Home</Link></li>
            <li><a href="/#about" className="hover:text-white transition-colors">About</a></li>
            <li><a href="/#features" className="hover:text-white transition-colors">Features</a></li>
            <li><a href="/#how-it-works" className="hover:text-white transition-colors">How It Works</a></li>
            <li><a href="/#developer" className="hover:text-white transition-colors">Developer</a></li>
            <li><a href="/#contact" className="hover:text-white transition-colors">Contact</a></li>
          </ul>
        </div>

        <div className="lg:col-span-3 space-y-3">
          <div className="text-xs font-semibold text-white">Platform Modules</div>
          <ul className="space-y-2 text-sm text-slate-400">
            <li><Link to="/businesses" className="hover:text-white transition-colors">Businesses Directory</Link></li>
            <li><Link to="/features" className="hover:text-white transition-colors">POS & Inventory Control</Link></li>
            <li><Link to="/pricing" className="hover:text-white transition-colors">Subscription Plans</Link></li>
            <li><Link to="/track-order" className="hover:text-white transition-colors">Customer Order Tracking</Link></li>
            <li><Link to="/register" className="hover:text-white transition-colors">Customer Registration</Link></li>
          </ul>
        </div>

        <div className="lg:col-span-3 space-y-3">
          <div className="text-xs font-semibold text-white">Governance & Legal</div>
          <ul className="space-y-2 text-sm text-slate-400">
            <li><Link to="/about" className="hover:text-white transition-colors">About BizFlow Africa</Link></li>
            <li><Link to="/contact" className="hover:text-white transition-colors">Business Onboarding Inquiry</Link></li>
            <li><Link to="/login" className="hover:text-white transition-colors">Sign In to Account</Link></li>
            <li><Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
            <li><Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} {config.platform_name || 'BizFlow Africa'}. All rights reserved.</span>
          <span>
            {config.developer_name
              ? `Developed by ${config.developer_name} · ${config.developer_role || 'Full Stack Developer'}`
              : `Built by ${config.developer_role || 'Full Stack Developer'} · Multi-Tenant Commercial Platform`}
          </span>
        </div>
      </div>
    </footer>
  );
}
