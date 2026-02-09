import { useState } from 'react';
import { LogOut, Building2, Users, BookOpen, BarChart3, Calendar } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { UnitsTab } from './UnitsTab';
import { StudentsTab } from './StudentsTab';
import { CoursesTab } from './CoursesTab';
import { CyclesTab } from './CyclesTab';
import { ReportsTab } from './ReportsTab';
import logoImg from '../../assets/image.png';

type Tab = 'units' | 'students' | 'courses' | 'cycles' | 'reports';

export function AcademicoDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('units');
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <img src={logoImg} alt="IDHS" className="h-12" />
              <h1 className="text-2xl font-bold text-slate-800">Módulo Acadêmico</h1>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center space-x-2 px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          <div className="border-b border-slate-200">
            <nav className="flex space-x-1 p-2 overflow-x-auto">
              <button
                onClick={() => setActiveTab('units')}
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'units'
                    ? 'bg-green-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Building2 className="w-5 h-5" />
                <span>Unidades</span>
              </button>
              <button
                onClick={() => setActiveTab('students')}
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'students'
                    ? 'bg-green-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Users className="w-5 h-5" />
                <span>Alunos</span>
              </button>
              <button
                onClick={() => setActiveTab('courses')}
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'courses'
                    ? 'bg-green-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <BookOpen className="w-5 h-5" />
                <span>Cursos</span>
              </button>
              <button
                onClick={() => setActiveTab('cycles')}
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'cycles'
                    ? 'bg-green-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Calendar className="w-5 h-5" />
                <span>Ciclos</span>
              </button>
              <button
                onClick={() => setActiveTab('reports')}
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'reports'
                    ? 'bg-green-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <BarChart3 className="w-5 h-5" />
                <span>Relatórios</span>
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'units' && <UnitsTab />}
            {activeTab === 'students' && <StudentsTab />}
            {activeTab === 'courses' && <CoursesTab />}
            {activeTab === 'cycles' && <CyclesTab />}
            {activeTab === 'reports' && <ReportsTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
