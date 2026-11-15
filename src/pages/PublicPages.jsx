import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Code2,
  Database,
  ExternalLink,
  GitBranch,
  Layers,
  Mail,
  MapPin,
  MessageSquare,
  Package,
  Phone,
  Search,
  ShoppingBag,
  ShoppingCart,
  Star,
  Store,
  Truck,
  UserCheck,
  Users,
  Video,
  Wallet,
  Wrench,
} from 'lucide-react';
import PublicHeader from '../components/PublicHeader.jsx';
import PublicFooter from '../components/PublicFooter.jsx';
import { RevealBlock } from '../hooks/useRevealOnScroll.js';
import StatusBadge from '../components/StatusBadge.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import VideoAdPlayer from '../components/VideoAdPlayer.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePlatformConfig } from '../context/PlatformConfigContext.jsx';
import { api } from '../services/api.js';
import { formatDate, formatDateTime, formatMoney } from '../utils/format.js';

const PLATFORM_FEATURES = [
  {
    title: 'Business Management',
    icon: Building2,
    desc: 'Organize company identity, currency defaults, tax rules, operating hours, and daily governance in one isolated workspace.',
  },
  {
    title: 'Sales and Point of Sale (POS)',
    icon: ShoppingCart,
    desc: 'Process counter sales quickly with product search, barcode lookup, split payments, and printable customer receipts.',
  },
  {
    title: 'Product Management',
    icon: Package,
    desc: 'Maintain structured SKU catalogs, categories, pricing tiers, cost tracking, and active product listings.',
  },
  {
    title: 'Inventory Management',
    icon: Boxes,
    desc: 'Track real-time stock quantities, low-stock alerts, stock adjustments, and inter-branch inventory transfers.',
  },
  {
    title: 'Customer Management',
    icon: Users,
    desc: 'Build verified customer profiles, monitor receivables and loyalty records, and manage customer inquiries cleanly.',
  },
  {
    title: 'Supplier Management',
    icon: Truck,
    desc: 'Track vendor contacts, purchase histories, and outstanding supplier payables across all business branches.',
  },
  {
    title: 'Financial Management',
    icon: Wallet,
    desc: 'Record revenue, cost of goods sold, operating expenses with approval workflows, and live profit visibility.',
  },
  {
    title: 'Employee Management',
    icon: UserCheck,
    desc: 'Assign staff to branches with role-based permissions covering managers, cashiers, accountants, and inventory teams.',
  },
  {
    title: 'Branch Management',
    icon: GitBranch,
    desc: 'Run multiple store locations under one business account with branch-level inventory, sales, and staff separation.',
  },
  {
    title: 'Order Management',
    icon: ShoppingBag,
    desc: 'Receive customer orders from the public directory and guide them smoothly from confirmation through delivery.',
  },
  {
    title: 'Reports and Analytics',
    icon: BarChart3,
    desc: 'Review daily, monthly, and yearly performance summaries, branch comparisons, and exportable operational reports.',
  },
  {
    title: 'Business Communication',
    icon: MessageSquare,
    desc: 'Keep employees aligned with internal branch messaging channels and business-wide announcements.',
  },
  {
    title: 'Task Management',
    icon: ClipboardList,
    desc: 'Assign operational tasks to team members, set deadlines and priorities, and collaborate via task comments.',
  },
  {
    title: 'Promotional Advertising',
    icon: Video,
    desc: 'Upload and publish promotional videos with product links and thumbnails directly to your public storefront.',
  },
  {
    title: 'AI Business Assistant',
    icon: Bot,
    desc: 'Ask natural business questions grounded in your own operational sales, stock, and branch records.',
  },
  {
    title: 'Notifications and Alerts',
    icon: Bell,
    desc: 'Stay informed about low inventory, incoming customer orders, expense approvals, and security updates.',
  },
];

const WORKFLOW_STEPS = [
  {
    step: '01',
    title: 'Platform Super Admin registers a business',
    desc: 'The Super Admin collects verified business profile details, tax configuration, subscription plan, and headquarters setup.',
  },
  {
    step: '02',
    title: 'Assigned Business Admin receives activation credentials',
    desc: 'The designated Business Admin receives a secure activation link, completes profile photo upload, and sets a permanent password.',
  },
  {
    step: '03',
    title: 'Business Admin sets up branches, products, and employees',
    desc: 'Configure store branches, categories, products, opening inventory, and staff accounts with role-specific permissions.',
  },
  {
    step: '04',
    title: 'Staff run daily business operations',
    desc: 'Cashiers, inventory managers, and accountants execute POS sales, stock transfers, purchase orders, and expense tracking.',
  },
  {
    step: '05',
    title: 'Business Admin monitors reports, profits, and team activities',
    desc: 'Review financial statements, branch performance charts, employee tasks, and audit logs from a unified dashboard.',
  },
  {
    step: '06',
    title: 'Customers browse businesses, order products, and track orders',
    desc: 'Registered customers explore public catalogs, watch promotional videos, place orders, and follow fulfillment live.',
  },
];

const PLATFORM_BENEFITS = [
  {
    title: 'Better Business Organization',
    desc: 'Unify products, branches, suppliers, staff, and customer orders in a single structured system.',
  },
  {
    title: 'Accurate Sales & Stock Tracking',
    desc: 'Every POS transaction and stock adjustment updates branch inventory and audit logs automatically.',
  },
  {
    title: 'Improved Team Collaboration',
    desc: 'Connect branch teams with assigned tasks, internal messaging, and role-controlled workflows.',
  },
  {
    title: 'Clear Financial Visibility',
    desc: 'Monitor sales revenue, approved expenses, receivables, payables, and gross margins without manual spreadsheets.',
  },
  {
    title: 'Faster Customer Service',
    desc: 'Accelerate checkout with barcode search, printed receipts, and online customer order fulfillment.',
  },
  {
    title: 'Reduced Manual Errors',
    desc: 'Replace error-prone paper books with validated entries, automated tax totals, and stock movement records.',
  },
  {
    title: 'Centralized Multi-Branch Control',
    desc: 'Oversee headquarters and regional branches from one dashboard with strict tenant data isolation.',
  },
  {
    title: 'Built for Sustainable Growth',
    desc: 'Scale seamlessly from a single neighborhood store into a multi-branch retail or wholesale operation.',
  },
];

const SUPPORTED_BUSINESSES = [
  'Retail Shops',
  'Supermarkets',
  'Wholesalers',
  'Pharmacies',
  'Hardware Stores',
  'Clothing & Fashion Stores',
  'Electronics Shops',
  'Restaurants & Cafés',
  'Service Businesses',
  'Small and Medium Enterprises (SMEs)',
];

const TECH_STACK = [
  {
    category: 'Frontend',
    icon: Layers,
    items: ['React.js', 'JavaScript', 'Vite', 'CSS / Tailwind CSS'],
  },
  {
    category: 'Backend',
    icon: Code2,
    items: ['Node.js', 'Express.js'],
  },
  {
    category: 'Database',
    icon: Database,
    items: ['MySQL'],
  },
  {
    category: 'Tools & Workflow',
    icon: Wrench,
    items: ['Git', 'GitHub', 'VS Code', 'Postman'],
  },
];

export function HomePage() {
  const { config } = usePlatformConfig();
  const location = useLocation();
  const [contactForm, setContactForm] = useState({
    full_name: '',
    email: '',
    phone: '+250',
    business_name: '',
    message: '',
  });
  const [contactStatus, setContactStatus] = useState({ type: '', text: '' });
  const [submittingContact, setSubmittingContact] = useState(false);

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.replace('#', '');
    const el = document.getElementById(id);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [location.hash]);

  const handleHomeContactSubmit = async (e) => {
    e.preventDefault();
    setSubmittingContact(true);
    setContactStatus({ type: '', text: '' });
    try {
      const { data } = await api.post('/public/contact', contactForm);
      setContactStatus({ type: 'success', text: data.message });
      setContactForm({ full_name: '', email: '', phone: '+250', business_name: '', message: '' });
    } catch (err) {
      setContactStatus({ type: 'error', text: err.message });
    } finally {
      setSubmittingContact(false);
    }
  };

  const socialLinks = [
    { label: 'LinkedIn', url: config.social_linkedin_url },
    { label: 'X / Twitter', url: config.social_x_url },
    { label: 'Instagram', url: config.social_instagram_url },
    { label: 'Facebook', url: config.social_facebook_url },
  ].filter((item) => Boolean(item.url && item.url.trim()));

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />

      {/* 1. Hero Section */}
      <section className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-16 lg:py-24 grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6 animate-fade-up">
            <p className="text-xs font-semibold tracking-wide text-sky-700 dark:text-sky-400">
              Complete Multi-Tenant Business Operations Platform
            </p>
            <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-[#0B192C] dark:text-white leading-[1.1] [text-wrap:balance]">
              Expand Your Trade with BizFlow Africa
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              BizFlow Africa helps businesses manage their daily operations, Point of Sale transactions,
              multi-branch inventory, customers, suppliers, employees, finances, and commercial activities
              from one structured, secure platform.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="#features"
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
              >
                Features
                <ArrowRight className="w-4 h-4" />
              </a>
              <Link
                to="/register"
                className="inline-flex items-center px-5 py-3 text-sm font-semibold text-[#0B192C] dark:text-white bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                Get Started
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Login
              </Link>
            </div>
            <div className="pt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span>Multi-Branch Workspace Control</span>
              <span aria-hidden="true">·</span>
              <span>Role-Based Staff Permissions</span>
              <span aria-hidden="true">·</span>
              <span>Customer Storefront & Order Tracking</span>
            </div>
          </div>

          <div className="lg:col-span-6 flex flex-col gap-4 animate-fade-up">
            <div className="flex-1 min-h-[300px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 relative">
              <img
                src="/src/assets/images/hero_kigali_commerce_1794724575172.jpg"
                alt="Retail and wholesale business operations running on BizFlow Africa"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 transition-transform duration-200 hover:-translate-y-0.5">
                <div className="text-xs font-semibold text-[#0B192C] dark:text-white">POS & Receipts</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Fast counter checkout & VAT control</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 transition-transform duration-200 hover:-translate-y-0.5">
                <div className="text-xs font-semibold text-[#0B192C] dark:text-white">Stock & Transfers</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Live inventory across store branches</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 transition-transform duration-200 hover:-translate-y-0.5">
                <div className="text-xs font-semibold text-[#0B192C] dark:text-white">Accounts & Team</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Expenses, staff roles & tasks</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. About BizFlow Africa Section */}
      <RevealBlock as="section" id="about" className="scroll-mt-20 max-w-7xl mx-auto px-6 py-20 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-5 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 min-h-[280px]">
            <img
              src="/src/assets/images/feature_pos_inventory_1794724576072.jpg"
              alt="Store manager verifying product inventory and operations"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">About BizFlow Africa</p>
              <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#0B192C] dark:text-white [text-wrap:balance]">
                Engineered to replace fragmented notebooks and spreadsheets with structured control
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                BizFlow Africa is a centralized business management SaaS platform built specifically for
                growing retail, wholesale, pharmacy, hardware, hospitality, and service businesses across Rwanda
                and Africa. Instead of juggling separate notebooks, disconnected POS terminals, and scattered spreadsheets,
                every team works inside one governed multi-tenant workspace.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                <h3 className="text-sm font-semibold text-[#0B192C] dark:text-white">Problems It Solves</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Eliminates untracked stock shrinkage, manual receipt errors, unclear cash and mobile money balances,
                  and delays in coordinating branch staff.
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                <h3 className="text-sm font-semibold text-[#0B192C] dark:text-white">Organizational Productivity</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Improves accountability with role-based permissions, audit logs, task assignments, and clear daily
                  profit and operational visibility.
                </p>
              </div>
            </div>
          </div>
        </div>
      </RevealBlock>

      {/* 3. Comprehensive Features Section (All 16 Modules) */}
      <RevealBlock as="section" id="features" className="scroll-mt-20 bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800 py-20">
        <div className="max-w-7xl mx-auto px-6 space-y-12">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">Platform Capabilities</p>
            <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#0B192C] dark:text-white [text-wrap:balance]">
              Sixteen integrated modules for complete commercial operations
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Every department—from front-counter sales and warehouse inventory to finance, staff tasks, and customer ordering—operates on shared, consistent data.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PLATFORM_FEATURES.map((feat) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.title}
                  className="bg-slate-50 dark:bg-slate-950 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5 hover:border-sky-500/50 dark:hover:border-sky-500/50 transition-[transform,border-color] duration-200 hover:-translate-y-0.5"
                >
                  <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-sky-700 dark:text-sky-400">
                    <Icon className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-[#0B192C] dark:text-white">{feat.title}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{feat.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </RevealBlock>

      {/* 4. How BizFlow Africa Works */}
      <RevealBlock as="section" id="how-it-works" className="scroll-mt-20 max-w-7xl mx-auto px-6 py-20 w-full space-y-12">
        <div className="max-w-2xl space-y-3">
          <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">How BizFlow Africa Works</p>
          <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#0B192C] dark:text-white [text-wrap:balance]">
            Structured governance from onboarding to daily trade
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Businesses are verified and registered by the Platform Super Admin so every workspace starts with clean isolation, assigned leadership, and verified customer visibility.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {WORKFLOW_STEPS.map((item) => (
            <div
              key={item.step}
              className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-sky-500/40"
            >
              <div className="text-xs font-mono font-bold text-sky-700 dark:text-sky-400">{item.step}.</div>
              <h3 className="text-base font-semibold text-[#0B192C] dark:text-white">{item.title}</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </RevealBlock>

      {/* 5. Platform Benefits & Supported Businesses */}
      <RevealBlock as="section" id="benefits" className="scroll-mt-20 bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800 py-20">
        <div className="max-w-7xl mx-auto px-6 space-y-16">
          <div className="space-y-8">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">Why Businesses Choose BizFlow Africa</p>
              <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#0B192C] dark:text-white [text-wrap:balance]">
                Practical operational benefits across every branch
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {PLATFORM_BENEFITS.map((b) => (
                <div
                  key={b.title}
                  className="bg-slate-50 dark:bg-slate-950 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-emerald-500/40"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-sm font-semibold text-[#0B192C] dark:text-white">{b.title}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{b.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-8 border-t border-slate-200 dark:border-slate-800 space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-1.5">
                <h2 className="text-xl font-bold text-[#0B192C] dark:text-white">Supported Business Sectors</h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Built to adapt to commercial workflows across diverse retail, wholesale, and service industries.
                </p>
              </div>
              <Link
                to="/businesses"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-400 hover:underline whitespace-nowrap shrink-0"
              >
                Explore Registered Businesses
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {SUPPORTED_BUSINESSES.map((sector) => (
                <div
                  key={sector}
                  className="bg-slate-50 dark:bg-slate-950 px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2"
                >
                  <Store className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400 shrink-0" />
                  <span className="truncate">{sector}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </RevealBlock>

      {/* 6. Developer Information Section */}
      <RevealBlock as="section" id="developer" className="scroll-mt-20 max-w-7xl mx-auto px-6 py-20 w-full space-y-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">Developer Information</p>
              <h2 className="text-2xl font-bold text-[#0B192C] dark:text-white">
                {config.developer_name ? config.developer_name : (config.developer_role || 'Full Stack Developer')}
              </h2>
              {config.developer_name && (
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {config.developer_role || 'Full Stack Developer'}
                </div>
              )}
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {config.developer_bio?.trim()
                ? config.developer_bio
                : 'BizFlow Africa is architected and engineered as a modern full-stack multi-tenant platform focused on reliable transaction integrity, clear financial reporting, and accessible business tooling for SMEs across Africa.'}
            </p>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-[#0B192C] dark:text-white">Project Vision</div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Equip growing African businesses with dependable digital record-keeping, multi-branch accountability,
                and customer connectivity without complex infrastructure overhead.
              </p>
            </div>

            {(config.developer_email ||
              config.developer_portfolio_url ||
              config.developer_github_url ||
              config.developer_linkedin_url) && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 text-xs">
                {config.developer_email && (
                  <a
                    href={`mailto:${config.developer_email}`}
                    className="inline-flex items-center gap-1.5 text-sky-700 dark:text-sky-400 hover:underline"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>{config.developer_email}</span>
                  </a>
                )}
                {config.developer_portfolio_url && (
                  <a
                    href={config.developer_portfolio_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400 hover:underline"
                  >
                    <span>Portfolio</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {config.developer_github_url && (
                  <a
                    href={config.developer_github_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400 hover:underline"
                  >
                    <span>GitHub</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {config.developer_linkedin_url && (
                  <a
                    href={config.developer_linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400 hover:underline"
                  >
                    <span>LinkedIn</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {TECH_STACK.map((group) => {
              const Icon = group.icon;
              return (
                <div
                  key={group.category}
                  className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#0B192C] dark:text-white">
                    <Icon className="w-4 h-4 text-sky-700 dark:text-sky-400" />
                    <span>{group.category}</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                    {group.items.map((tech) => (
                      <li key={tech} className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>{tech}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </RevealBlock>

      {/* 7. Contact Section */}
      <RevealBlock as="section" id="contact" className="scroll-mt-20 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-20">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-5 space-y-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">Contact & Onboarding</p>
              <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#0B192C] dark:text-white [text-wrap:balance]">
                Connect with the BizFlow Africa team
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Reach out to request new business onboarding, schedule a platform walkthrough, or ask questions about workspace administration.
              </p>
            </div>

            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-sky-700 dark:text-sky-400 shrink-0" />
                <a
                  href={`mailto:${config.support_email || 'support@bizflow.africa'}`}
                  className="font-medium text-slate-900 dark:text-white hover:underline"
                >
                  {config.support_email || 'support@bizflow.africa'}
                </a>
              </div>
              {config.support_phone && (
                <div className="flex items-center gap-2.5">
                  <Phone className="w-4 h-4 text-sky-700 dark:text-sky-400 shrink-0" />
                  <span className="font-medium text-slate-900 dark:text-white tabular-nums">{config.support_phone}</span>
                </div>
              )}
              {config.platform_location && (
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4 text-sky-700 dark:text-sky-400 shrink-0" />
                  <span>{config.platform_location}</span>
                </div>
              )}
            </div>

            {socialLinks.length > 0 && (
              <div className="pt-2 flex flex-wrap gap-3 text-xs">
                {socialLinks.map((s) => (
                  <a
                    key={s.label}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <span>{s.label}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={handleHomeContactSubmit}
            className="lg:col-span-7 bg-slate-50 dark:bg-slate-950 p-6 sm:p-8 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <h3 className="text-base font-bold text-[#0B192C] dark:text-white">Send an Inquiry</h3>
            {contactStatus.text && (
              <div
                className={`p-3 rounded-lg text-xs font-medium border ${
                  contactStatus.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900'
                    : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-900'
                }`}
              >
                {contactStatus.text}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                <input
                  required
                  value={contactForm.full_name}
                  onChange={(e) => setContactForm({ ...contactForm, full_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Email</label>
                <input
                  required
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Phone</label>
                <input
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Business Name</label>
                <input
                  value={contactForm.business_name}
                  onChange={(e) => setContactForm({ ...contactForm, business_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Message</label>
              <textarea
                required
                rows={4}
                value={contactForm.message}
                onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                placeholder="Tell us about your business or how we can help..."
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
            </div>
            <button
              type="submit"
              disabled={submittingContact}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60 transition-colors"
            >
              {submittingContact ? 'Sending...' : 'Send Message'}
            </button>
          </form>
        </div>
      </RevealBlock>

      <PublicFooter />
    </div>
  );
}

export function PublicBusinessesPage() {
  const [businesses, setBusinesses] = useState([]);
  const [videos, setVideos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        q: search.trim() || undefined,
        category: category || undefined,
      };
      const [bRes, vRes] = await Promise.all([
        api.get('/public/businesses', { params }),
        api.get('/public/videos', { params }),
      ]);
      setBusinesses(bRes.data.businesses || []);
      setVideos(vRes.data.videos || []);
      if (bRes.data.categories?.length) setCategories(bRes.data.categories);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, category]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 max-w-7xl mx-auto px-6 py-12 w-full space-y-8 animate-fade-up">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="text-3xl font-bold text-[#0B192C] dark:text-white">Registered Businesses Directory</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Browse verified businesses on BizFlow Africa, explore published catalogs, and place customer orders.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-2.5" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search businesses or cities..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-lg">{error}</div>}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-52 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse" />
            ))}
          </div>
        ) : businesses.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 p-12 rounded-xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
            <Store className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">No publicly listed businesses match yet</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Businesses appear here once registered and activated by the Platform Super Admin.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {businesses.map((b) => (
              <div key={b.id} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-5">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    {b.logo_url ? (
                      <img src={b.logo_url} alt={b.name} referrerPolicy="no-referrer" className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-sm font-bold text-[#0B192C] dark:text-sky-300 shrink-0">
                        {b.name?.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">{b.name}</h2>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{b.category}</div>
                    </div>
                  </div>
                  {b.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">{b.description}</p>
                  )}
                  <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                      <span className="truncate">{b.district}, {b.province}, {b.country}</span>
                    </div>
                    {b.operating_hours && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                        <span className="truncate">{b.operating_hours}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                    {b.product_count} products · {b.review_count > 0 ? `${b.avg_rating}★ (${b.review_count})` : 'No reviews yet'}
                  </div>
                  <Link
                    to={`/businesses/${b.slug}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 whitespace-nowrap"
                  >
                    View Catalog
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && videos.length > 0 && (
          <section className="space-y-4 pt-4">
            <div>
              <h2 className="text-xl font-bold text-[#0B192C] dark:text-white">Featured Promotional Videos</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Watch product and service showcases published by verified businesses on BizFlow Africa.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((vid) => (
                <VideoAdPlayer key={vid.id} video={vid} showBusiness />
              ))}
            </div>
          </section>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}

export function PublicBusinessDetailPage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cart, setCart] = useState({});
  const [branchId, setBranchId] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);

  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '', product_id: '' });
  const [contactMsg, setContactMsg] = useState('');

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/public/businesses/${slug}`);
      setData(res.data);
      if (res.data.branches?.length && !branchId) {
        setBranchId(String(res.data.branches[0].id));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [slug, branchId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const adjustQty = (productId, delta) => {
    setCart((prev) => {
      const next = Math.max(0, (prev[productId] || 0) + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: next };
    });
  };

  const cartItems = (data?.products || []).filter((p) => cart[p.id] > 0);
  const cartTotal = cartItems.reduce((sum, p) => sum + Number(p.selling_price) * cart[p.id], 0);

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }
    if (!cartItems.length) return;
    setError('');
    setNotice('');
    setSubmittingOrder(true);
    try {
      const res = await api.post('/customer/orders', {
        business_id: data.business.id,
        branch_id: branchId ? Number(branchId) : null,
        delivery_address: deliveryAddress,
        notes: orderNotes,
        items: cartItems.map((p) => ({ product_id: p.id, quantity: cart[p.id] })),
      });
      setCart({});
      setDeliveryAddress('');
      setOrderNotes('');
      setNotice(res.data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }
    setError('');
    setNotice('');
    try {
      const res = await api.post(`/customer/businesses/${data.business.id}/reviews`, {
        rating: Number(reviewForm.rating),
        comment: reviewForm.comment,
        product_id: reviewForm.product_id ? Number(reviewForm.product_id) : null,
      });
      setReviewForm({ rating: 5, comment: '', product_id: '' });
      setNotice(res.data.message);
      await loadDetail();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleContactBusiness = async (e) => {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }
    setError('');
    setNotice('');
    try {
      const res = await api.post(`/customer/businesses/${data.business.id}/contact`, { message: contactMsg });
      setContactMsg('');
      setNotice(res.data.message);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 max-w-7xl mx-auto px-6 py-10 w-full space-y-8">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          <Link to="/businesses" className="hover:text-slate-900 dark:hover:text-white">← Back to Businesses Directory</Link>
        </div>

        {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-lg">{error}</div>}
        {notice && (
          <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-lg flex items-center justify-between gap-4">
            <span>{notice}</span>
            {user && !user.is_platform_admin && (
              <Link to="/customer" className="font-semibold underline whitespace-nowrap">View in Customer Portal →</Link>
            )}
          </div>
        )}

        {loading ? (
          <div className="h-64 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse" />
        ) : !data?.business ? (
          <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-400">
            Business profile not found.
          </div>
        ) : (
          <>
            {/* Business Profile Header */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                {data.business.logo_url ? (
                  <img src={data.business.logo_url} alt={data.business.name} referrerPolicy="no-referrer" className="w-16 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-lg font-bold text-[#0B192C] dark:text-sky-300 shrink-0">
                    {data.business.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold text-[#0B192C] dark:text-white">{data.business.name}</h1>
                    {data.business.business_code && (
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{data.business.business_code}</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">{data.business.category} · {data.business.physical_address}, {data.business.district}</div>
                  {data.business.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 max-w-2xl pt-1">{data.business.description}</p>
                  )}
                </div>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 shrink-0">
                <div>Phone: <span className="font-medium text-slate-900 dark:text-slate-100 tabular-nums">{data.business.phone}</span></div>
                <div>Email: <span className="font-medium text-slate-900 dark:text-slate-100">{data.business.email}</span></div>
                {data.business.operating_hours && (
                  <div>Hours: <span className="font-medium text-slate-900 dark:text-slate-100">{data.business.operating_hours}</span></div>
                )}
              </div>
            </div>

            {/* Published Business Promotional Videos */}
            {data.videos?.length > 0 && (
              <section className="space-y-4">
                <div>
                  <h2 className="text-base font-bold text-[#0B192C] dark:text-white">Promotional Videos</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Product and service showcases published by {data.business.name}.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {data.videos.map((vid) => (
                    <VideoAdPlayer key={vid.id} video={vid} />
                  ))}
                </div>
              </section>
            )}

            {/* Catalog + Customer Order Builder */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-8 space-y-4">
                <h2 className="text-base font-bold text-[#0B192C] dark:text-white">Published Products & Services</h2>
                {data.products.length === 0 ? (
                  <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                    This business has not published catalog items yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {data.products.map((p) => (
                      <div key={p.id} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3">
                        <div className="space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{p.name}</div>
                            <span className={`text-[11px] font-medium ${p.in_stock ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                              {p.in_stock ? 'Available' : 'Out of stock'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">{p.category_name || 'General'} · {p.unit}</div>
                          {p.description && <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{p.description}</p>}
                        </div>
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <div className="text-sm font-bold text-[#0B192C] dark:text-sky-300 tabular-nums">
                            {formatMoney(p.selling_price, data.business.currency_code)}
                          </div>
                          <div className="flex items-center gap-2">
                            {cart[p.id] > 0 ? (
                              <div className="inline-flex items-center border border-slate-200 dark:border-slate-700 rounded-lg text-xs">
                                <button type="button" onClick={() => adjustQty(p.id, -1)} className="px-2.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-800">-</button>
                                <span className="px-2 font-semibold tabular-nums">{cart[p.id]}</span>
                                <button type="button" onClick={() => adjustQty(p.id, 1)} className="px-2.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-800">+</button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={!p.in_stock}
                                onClick={() => adjustQty(p.id, 1)}
                                className="px-3 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40"
                              >
                                Add to Order
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="lg:col-span-4 space-y-6">
                <form onSubmit={handlePlaceOrder} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">Customer Order Basket</h2>
                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{cartItems.length} item(s)</span>
                  </div>

                  {cartItems.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Select available products from the catalog to build an order.</p>
                  ) : (
                    <>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                        {cartItems.map((item) => (
                          <div key={item.id} className="py-2 flex items-center justify-between gap-2">
                            <div className="truncate">{item.name} × {cart[item.id]}</div>
                            <div className="font-semibold tabular-nums shrink-0">
                              {formatMoney(Number(item.selling_price) * cart[item.id], data.business.currency_code)}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between text-sm font-bold text-[#0B192C] dark:text-white">
                        <span>Estimated Total</span>
                        <span className="tabular-nums">{formatMoney(cartTotal, data.business.currency_code)}</span>
                      </div>

                      {data.branches.length > 0 && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Fulfillment Branch</label>
                          <select
                            value={branchId}
                            onChange={(e) => setBranchId(e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                          >
                            {data.branches.map((br) => (
                              <option key={br.id} value={br.id}>{br.name} ({br.district || br.province})</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Delivery Address</label>
                        <input
                          required
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          placeholder="Sector, cell, street / landmark"
                          className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Order Notes (Optional)</label>
                        <input
                          value={orderNotes}
                          onChange={(e) => setOrderNotes(e.target.value)}
                          placeholder="Preferred delivery window..."
                          className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        />
                      </div>

                      {user ? (
                        <button
                          type="submit"
                          disabled={submittingOrder}
                          className="w-full py-2.5 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60"
                        >
                          {submittingOrder ? 'Submitting Order...' : 'Place Customer Order'}
                        </button>
                      ) : (
                        <Link
                          to="/login"
                          className="block text-center w-full py-2.5 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
                        >
                          Sign In as Customer to Place Order
                        </Link>
                      )}
                    </>
                  )}
                </form>

                {/* Contact Business */}
                <form onSubmit={handleContactBusiness} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#0B192C] dark:text-white">
                    <MessageSquare className="w-4 h-4 text-sky-700 dark:text-sky-400" />
                    <span>Message This Business</span>
                  </div>
                  <textarea
                    required
                    rows={3}
                    value={contactMsg}
                    onChange={(e) => setContactMsg(e.target.value)}
                    placeholder="Ask about stock availability, bulk pricing, or delivery..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                  {user ? (
                    <button type="submit" className="w-full py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">
                      Send Message
                    </button>
                  ) : (
                    <Link to="/login" className="block text-center py-2 text-xs font-semibold text-sky-700 dark:text-sky-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                      Sign In to Message Business
                    </Link>
                  )}
                </form>
              </div>
            </div>

            {/* Reviews Section */}
            <section className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-[#0B192C] dark:text-white">Customer Reviews ({data.reviews.length})</h2>
              </div>

              {data.allow_customer_reviews && (
                <form onSubmit={handleSubmitReview} className="grid grid-cols-1 md:grid-cols-12 gap-3 pb-4 border-b border-slate-100 dark:border-slate-800 text-xs">
                  <select
                    value={reviewForm.rating}
                    onChange={(e) => setReviewForm({ ...reviewForm, rating: e.target.value })}
                    className="md:col-span-2 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    <option value="5">5 Stars</option>
                    <option value="4">4 Stars</option>
                    <option value="3">3 Stars</option>
                    <option value="2">2 Stars</option>
                    <option value="1">1 Star</option>
                  </select>
                  <select
                    value={reviewForm.product_id}
                    onChange={(e) => setReviewForm({ ...reviewForm, product_id: e.target.value })}
                    className="md:col-span-3 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    <option value="">General Business Review</option>
                    {data.products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <input
                    required
                    value={reviewForm.comment}
                    onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                    placeholder="Share your verified experience..."
                    className="md:col-span-5 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                  {user ? (
                    <button type="submit" className="md:col-span-2 px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">
                      Submit Review
                    </button>
                  ) : (
                    <Link to="/login" className="md:col-span-2 text-center px-4 py-2 font-semibold text-sky-700 dark:text-sky-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                      Sign In
                    </Link>
                  )}
                </form>
              )}

              {data.reviews.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">No customer reviews submitted yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {data.reviews.map((rev) => (
                    <div key={rev.id} className="py-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                          <UserAvatar src={rev.customer_avatar} name={rev.customer_name} size="xs" />
                          <span>{rev.customer_name} {rev.product_name ? `· ${rev.product_name}` : ''}</span>
                        </div>
                        <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold tabular-nums">
                          <Star className="w-3.5 h-3.5 fill-amber-500" />
                          <span>{rev.rating}/5</span>
                          <span className="text-slate-400 dark:text-slate-500 font-normal ml-2">{formatDate(rev.created_at)}</span>
                        </div>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300">{rev.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}

export function FeaturesPage() {
  const modules = [
    ['Point of Sale (POS)', 'Instant search & barcode scanning, authorized discounts, MTN MoMo, Airtel Money, Cash, Card, partial payments, and PDF receipts.'],
    ['Inventory & Transfers', 'Every stock change writes an immutable stock_movements record. Atomic row locking prevents simultaneous overselling.'],
    ['Purchases & Suppliers', 'Issue purchase orders, track supplier balances, and update branch inventory only when physical goods are received.'],
    ['Financial Management', 'Track sales revenue, COGS, gross profit, operating expenses with manager approval workflows, and cash flow.'],
    ['CRM & Customer Orders', 'Manage retail/wholesale customer balances, loyalty points, complaints, and 7-stage delivery order tracking.'],
    ['Employees, Tasks & Chat', 'Invite staff with custom RBAC roles, assign branch tasks, broadcast announcements, and chat in real time.'],
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 max-w-6xl mx-auto px-6 py-16 space-y-12 animate-fade-up">
        <div className="space-y-3 max-w-2xl">
          <h1 className="text-3xl font-bold text-[#0B192C] dark:text-white">Complete Operational Capabilities</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Designed for electronics stores, supermarkets, pharmacies, hardware suppliers, and service businesses.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map(([title, desc], idx) => (
            <div key={title} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="text-xs font-mono text-sky-700 dark:text-sky-400 font-semibold">0{idx + 1}.</div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

export function PricingPage() {
  const [plans, setPlans] = useState([]);
  const [billing, setBilling] = useState('monthly');

  useEffect(() => {
    api.get('/subscriptions/plans').then((res) => setPlans(res.data.plans || [])).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 max-w-7xl mx-auto px-6 py-16 space-y-10 w-full animate-fade-up">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-[#0B192C] dark:text-white">Transparent RWF Subscription Plans</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Businesses are onboarded and verified by Platform Super Admin. Contact our team to provision your business workspace.
            </p>
          </div>
          <div className="inline-flex p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg self-start">
            <button
              type="button"
              onClick={() => setBilling('monthly')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                billing === 'monthly'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              onClick={() => setBilling('annual')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                billing === 'annual'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Annual (2 Months Free)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan) => {
            const price = billing === 'annual' ? plan.annual_price_rwf : plan.monthly_price_rwf;
            return (
              <div
                key={plan.id}
                className={`bg-white dark:bg-slate-900 p-6 rounded-xl border flex flex-col justify-between space-y-6 ${
                  plan.code === 'business'
                    ? 'border-sky-600 dark:border-sky-500 ring-1 ring-sky-600 dark:ring-sky-500'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">{plan.name}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{plan.target_audience}</p>
                  </div>
                  <div className="text-2xl font-bold text-[#0B192C] dark:text-white tabular-nums">
                    {formatMoney(price, 'RWF')}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400"> / {billing === 'annual' ? 'year' : 'month'}</span>
                  </div>
                  <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Up to {plan.max_employees} employees</li>
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Up to {plan.max_branches} branches</li>
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> {plan.max_products.toLocaleString()} active SKUs</li>
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> {plan.max_ai_requests_monthly} AI queries / month</li>
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> {plan.advanced_reports_enabled ? 'Full P&L & Export suite' : 'Standard daily reports'}</li>
                  </ul>
                </div>
                <Link
                  to="/contact"
                  className="block text-center py-2.5 px-4 text-xs font-semibold rounded-lg bg-[#0B192C] dark:bg-sky-600 text-white hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors"
                >
                  Request Business Onboarding
                </Link>
              </div>
            );
          })}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

export function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-16 space-y-8 animate-fade-up">
        <h1 className="text-3xl font-bold text-[#0B192C] dark:text-white">About BizFlow Africa</h1>
        <p className="text-base text-slate-700 dark:text-slate-300 leading-relaxed">
          BizFlow Africa was engineered to replace fragmented paper books, disconnected POS terminals,
          and insecure spreadsheets across Rwanda and East Africa with one reliable commercial cloud platform.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Rwanda-First Engineering</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Configured out of the box with Rwandan Franc (RWF), +250 phone validation, Africa/Kigali
              timezone, configurable VAT rates, and MTN MoMo / Airtel Money tracking.
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Built for Continental Growth</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Multi-country localization settings allow businesses expanding into Kenya, Uganda, Tanzania,
              Ghana, or Nigeria to configure regional currencies and tax rules in seconds.
            </p>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

export function ContactPage() {
  const [form, setForm] = useState({ full_name: '', email: '', phone: '+250', business_name: '', message: '' });
  const [status, setStatus] = useState({ type: '', text: '' });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus({ type: '', text: '' });
    try {
      const { data } = await api.post('/public/contact', form);
      setStatus({ type: 'success', text: data.message });
      setForm({ full_name: '', email: '', phone: '+250', business_name: '', message: '' });
    } catch (err) {
      setStatus({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-16 w-full space-y-8 animate-fade-up">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-[#0B192C] dark:text-white">Contact Our Kigali Team</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Request new business registration, enterprise onboarding, branch hardware advice, or custom support.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          {status.text && (
            <div className={`p-3 rounded-lg text-xs font-medium border ${status.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900' : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-900'}`}>
              {status.text}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
              <input
                required
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Email</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Business Name</label>
              <input
                value={form.business_name}
                onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Message</label>
            <textarea
              required
              rows={4}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60"
          >
            {submitting ? 'Sending...' : 'Send Inquiry'}
          </button>
        </form>
      </main>
      <PublicFooter />
    </div>
  );
}

export function TrackOrderPage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleTrack = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    try {
      const { data } = await api.get('/public/orders/track', {
        params: { order_number: orderNumber, phone },
      });
      setResult(data);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 max-w-2xl mx-auto px-6 py-16 w-full space-y-6 animate-fade-up">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-[#0B192C] dark:text-white">Customer Order Tracking</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Enter your order number and phone number to check live fulfillment and delivery status.
          </p>
        </div>

        <form onSubmit={handleTrack} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Order Number</label>
              <input
                required
                placeholder="ORD-123456"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Customer Phone</label>
              <input
                required
                placeholder="+250788..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
          >
            <Search className="w-4 h-4" />
            Track Order
          </button>
        </form>

        {error && <div className="p-4 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-sm rounded-lg">{error}</div>}

        {result && (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{result.order.business_name} · {result.order.branch_name}</div>
                <div className="text-lg font-bold font-mono text-slate-900 dark:text-white">{result.order.order_number}</div>
              </div>
              <StatusBadge status={result.order.order_status} />
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-300">
              Total: <span className="font-semibold text-slate-900 dark:text-white tabular-nums">{formatMoney(result.order.total_amount, result.order.currency_code)}</span>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Status Timeline</div>
              {(result.history || []).map((h, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs py-1">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{h.new_status.replace(/_/g, ' ')} {h.note ? `— ${h.note}` : ''}</span>
                  <span className="text-slate-500 dark:text-slate-400 tabular-nums">{formatDateTime(h.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}

export function LegalPage({ title }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-16 space-y-6">
        <h1 className="text-3xl font-bold text-[#0B192C] dark:text-white">{title}</h1>
        <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <p>
            BizFlow Africa operates as a multi-tenant commercial software platform with strict data isolation.
            Each registered business owns all operational records, product catalogs, customer data, and financial
            transactions created inside its workspace.
          </p>
          <p>
            When a subscription expires, BizFlow Africa preserves tenant records under defined grace-period
            and retention policies rather than deleting business history unexpectedly. Platform administrators
            never receive unrestricted access to private tenant financial entries.
          </p>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
