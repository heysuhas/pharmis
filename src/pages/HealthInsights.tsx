import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  BarChart2, 
  TrendingUp, 
  Brain, 
  Activity,
  Search,
  Calendar,
  Sun,
  Droplets,
  Dumbbell,
  Heart,
  BedDouble,
  Pill,
  Filter,
  RefreshCw
} from 'lucide-react';
import { insightsAPI, logsAPI, dashboardAPI } from '../services/api';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  BarChart,
  Bar
} from 'recharts';
import { Link } from 'react-router-dom';

interface Insight {
  id: number;
  title: string;
  content: string;
  category: string;
  generated_date: string;
}

interface MoodData {
  date: string;
  mood: number;
}

interface SymptomData {
  name: string;
  count: number;
}

export default function HealthInsights() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [moodData, setMoodData] = useState<MoodData[]>([]);
  const [symptomsData, setSymptomsData] = useState<SymptomData[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState('30'); // days
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [hasNewData, setHasNewData] = useState(false);
  
  const categories = [
    { name: 'Sleep', icon: BedDouble, color: 'bg-indigo-100 text-indigo-600' },
    { name: 'Exercise', icon: Dumbbell, color: 'bg-emerald-100 text-emerald-600' },
    { name: 'Hydration', icon: Droplets, color: 'bg-blue-100 text-blue-600' },
    { name: 'Mood', icon: Sun, color: 'bg-amber-100 text-amber-600' },
    { name: 'Symptoms', icon: Activity, color: 'bg-red-100 text-red-600' },
    { name: 'Medication', icon: Pill, color: 'bg-purple-100 text-purple-600' },
  ];

  // Function to check if there's new health data
  const checkForNewData = async () => {
    try {
      const response = await logsAPI.getLatestLogTimestamp();
      const latestLogTime = new Date(response.data.timestamp).getTime();
      setHasNewData(latestLogTime > lastFetchTime);
    } catch (error) {
      console.error('Error checking for new data:', error);
    }
  };

  const fetchData = async () => {
    try {
      setIsRefreshing(true);
      
      // Fetch insights based on selected category
      const params = selectedCategory ? { category: selectedCategory, timeRange } : { timeRange };
      const insightsResponse = await insightsAPI.getInsights(params);
      
      if (Array.isArray(insightsResponse.data)) {
        setInsights(insightsResponse.data);
      } else {
        setInsights([]);
      }
      
      // Fetch mood data
      const moodResponse = await dashboardAPI.getMoodChart({ days: parseInt(timeRange) });
      setMoodData(moodResponse.data);
      
      // Fetch symptoms data
      const symptomsResponse = await dashboardAPI.getTopSymptoms();
      setSymptomsData(symptomsResponse.data);
      
      setLastFetchTime(Date.now());
      setHasNewData(false);
    } catch (error) {
      console.error('Error fetching health insights data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Check for new data every 5 minutes
  useEffect(() => {
    const interval = setInterval(checkForNewData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [lastFetchTime]);
  
  useEffect(() => {
    fetchData();
  }, [selectedCategory, timeRange]);
  
  // Filter insights based on search query
  const filteredInsights = insights.filter(insight => 
    insight.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    insight.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getCategoryColor = (category: string) => {
    const found = categories.find(c => c.name.toLowerCase() === category.toLowerCase());
    return found ? found.color : 'bg-neutral-100 text-neutral-600';
  };

  const getCategoryIcon = (category: string) => {
    const found = categories.find(c => c.name.toLowerCase() === category.toLowerCase());
    return found ? found.icon : Brain;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-2">Health Insights</h1>
        <p className="text-neutral-500">
          AI-powered analysis of your health patterns and trends
        </p>
      </div>
      
      {/* Filters and search */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-5 w-5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search insights..."
            className="input pl-10 w-full"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2">
          <select
            className="input"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 3 months</option>
            <option value="180">Last 6 months</option>
          </select>
          
          <button 
            className={`btn btn-outline flex items-center ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''} ${
              hasNewData ? 'bg-primary-50 border-primary-200' : ''
            }`}
            onClick={fetchData}
            disabled={isRefreshing}
          >
            <RefreshCw size={16} className={`mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {hasNewData ? 'New Data Available' : 'Refresh'}
          </button>
        </div>
      </div>
      
      {/* Categories */}
      <div className="flex overflow-x-auto pb-2 mb-6 gap-2">
        <button
          className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            selectedCategory === null
              ? 'bg-primary-100 text-primary-700'
              : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          }`}
          onClick={() => setSelectedCategory(null)}
        >
          All Insights
        </button>
        
        {categories.map((category) => (
          <button
            key={category.name}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center ${
              selectedCategory === category.name
                ? 'bg-primary-100 text-primary-700'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
            onClick={() => setSelectedCategory(selectedCategory === category.name ? null : category.name)}
          >
            <category.icon size={16} className="mr-2" />
            {category.name}
          </button>
        ))}
      </div>
      
      {/* Charts section */}
      {!isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Mood trends chart */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4 flex items-center">
              <TrendingUp size={20} className="mr-2 text-primary-600" />
              Mood Trends
            </h2>
            
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={moodData}
                  margin={{ top: 5, right: 20, bottom: 20, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatDate}
                    minTickGap={15}
                  />
                  <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} />
                  <Tooltip 
                    formatter={(value) => [`Mood: ${value}`, 'Mood Level']}
                    labelFormatter={(label) => `Date: ${formatDate(label as string)}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="mood"
                    stroke="#4F46E5"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#4F46E5', strokeWidth: 0 }}
                    activeDot={{ r: 6, fill: '#4F46E5', strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            
            <div className="mt-2 text-sm text-neutral-500">
              Your mood variations over the selected time period
            </div>
          </div>
          
          {/* Top reported symptoms chart */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4 flex items-center">
              <Activity size={20} className="mr-2 text-secondary-600" />
              Top Reported Symptoms
            </h2>
            
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={symptomsData}
                  layout="vertical"
                  margin={{ top: 5, right: 20, bottom: 5, left: 70 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" domain={[0, 'dataMax + 1']} />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    tick={{ fontSize: 12 }} 
                    width={70} 
                  />
                  <Tooltip 
                    formatter={(value) => [`Count: ${value}`, 'Occurrences']}
                  />
                  <Bar
                    dataKey="count"
                    fill="#0D9488"
                    radius={[0, 4, 4, 0]}
                    barSize={20}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            <div className="mt-2 text-sm text-neutral-500">
              Most frequently reported symptoms in your daily logs
            </div>
          </div>
        </div>
      )}
      
      {/* AI Insights section */}
      <h2 className="text-xl font-semibold mb-4 flex items-center">
        <Brain size={22} className="mr-2 text-primary-600" />
        AI-Generated Health Insights
      </h2>
      
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-neutral-200 rounded-full"></div>
                <div className="ml-3">
                  <div className="h-4 bg-neutral-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-neutral-200 rounded w-1/2"></div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-neutral-200 rounded w-full"></div>
                <div className="h-4 bg-neutral-200 rounded w-3/4"></div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredInsights.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredInsights.map((insight) => {
            const CategoryIcon = getCategoryIcon(insight.category);
            const categoryColorClass = getCategoryColor(insight.category);
            
            return (
              <motion.div
                key={insight.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="card hover:shadow-card-hover"
              >
                <div className="flex items-start mb-4">
                  <div className={`w-10 h-10 ${categoryColorClass} rounded-full flex items-center justify-center`}>
                    <CategoryIcon size={18} />
                  </div>
                  <div className="ml-3">
                    <h3 className="font-medium">{insight.title}</h3>
                    <p className="text-xs text-neutral-500">
                      <span className="inline-block bg-neutral-100 px-2 py-0.5 rounded-full">
                        {insight.category}
                      </span>
                      <span className="ml-2">
                        {new Date(insight.generated_date).toLocaleDateString()}
                      </span>
                    </p>
                  </div>
                </div>
                
                <p className="text-sm text-neutral-700 whitespace-pre-line">{insight.content}</p>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="card text-center py-10">
          <Brain size={48} className="mx-auto mb-4 text-neutral-300" />
          <h3 className="text-lg font-medium mb-2">No insights available</h3>
          <p className="text-neutral-500 mb-6 max-w-md mx-auto">
            {searchQuery 
              ? "No insights match your search criteria. Try adjusting your filters."
              : "Keep logging your daily health data to receive personalized insights based on your patterns."}
          </p>
          <Link to="/daily-log" className="btn btn-primary inline-flex items-center">
            <Calendar size={18} className="mr-2" />
            Add a daily log
          </Link>
        </div>
      )}
    </motion.div>
  );
}