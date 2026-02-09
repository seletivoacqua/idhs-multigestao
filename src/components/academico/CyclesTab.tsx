import { useState, useEffect } from 'react';
import { Plus, Calendar, Edit2, Save, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Cycle {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'closed';
  created_at: string;
  _count?: { classes: number };
}

export function CyclesTab() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingCycle, setEditingCycle] = useState<Cycle | null>(null);
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    start_date: '',
    end_date: '',
  });

  useEffect(() => {
    loadCycles();
  }, []);

  const loadCycles = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('cycles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading cycles:', error);
      return;
    }

    const cyclesWithCount = await Promise.all(
      (data || []).map(async (cycle) => {
        const { count } = await supabase
          .from('classes')
          .select('*', { count: 'exact', head: true })
          .eq('cycle_id', cycle.id);

        return { ...cycle, _count: { classes: count || 0 } };
      })
    );

    setCycles(cyclesWithCount);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (new Date(formData.end_date) < new Date(formData.start_date)) {
      alert('A data de fim deve ser posterior à data de início');
      return;
    }

    if (editingCycle) {
      const { error } = await supabase
        .from('cycles')
        .update({
          name: formData.name,
          start_date: formData.start_date,
          end_date: formData.end_date,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingCycle.id);

      if (error) {
        console.error('Error updating cycle:', error);
        alert('Erro ao atualizar ciclo');
        return;
      }

      alert('Ciclo atualizado com sucesso!');
    } else {
      const { error } = await supabase.from('cycles').insert([
        {
          user_id: user.id,
          name: formData.name,
          start_date: formData.start_date,
          end_date: formData.end_date,
          status: 'active',
        },
      ]);

      if (error) {
        console.error('Error creating cycle:', error);
        alert('Erro ao criar ciclo');
        return;
      }

      alert('Ciclo iniciado com sucesso!');
    }

    resetForm();
    loadCycles();
  };

  const resetForm = () => {
    setShowModal(false);
    setEditingCycle(null);
    setFormData({
      name: '',
      start_date: '',
      end_date: '',
    });
  };

  const handleEdit = (cycle: Cycle) => {
    setEditingCycle(cycle);
    setFormData({
      name: cycle.name,
      start_date: cycle.start_date,
      end_date: cycle.end_date,
    });
    setShowModal(true);
  };

  const handleCloseCycle = async (cycleId: string) => {
    if (!confirm('Tem certeza que deseja encerrar este ciclo? Esta ação não pode ser desfeita.')) return;

    const { data: classes } = await supabase
      .from('classes')
      .select('id, modality')
      .eq('cycle_id', cycleId);

    if (classes) {
      for (const cls of classes) {
        const { error } = await supabase
          .from('classes')
          .update({ status: 'closed' })
          .eq('id', cls.id);

        if (error) {
          console.error('Error closing class:', error);
        }
      }
    }

    const { error } = await supabase
      .from('cycles')
      .update({
        status: 'closed',
        updated_at: new Date().toISOString()
      })
      .eq('id', cycleId);

    if (error) {
      console.error('Error closing cycle:', error);
      alert('Erro ao encerrar ciclo');
      return;
    }

    alert('Ciclo encerrado com sucesso!');
    loadCycles();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-800">Ciclos</h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Iniciar Ciclo</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cycles.map((cycle) => (
          <div
            key={cycle.id}
            className="bg-white border border-slate-200 rounded-lg p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Calendar className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">{cycle.name}</h3>
                  <p className="text-sm text-slate-600">
                    {cycle._count?.classes || 0} {cycle._count?.classes === 1 ? 'turma' : 'turmas'}
                  </p>
                </div>
              </div>
              <span
                className={`px-2 py-1 rounded-full text-xs font-medium ${
                  cycle.status === 'active'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {cycle.status === 'active' ? 'Ativo' : 'Encerrado'}
              </span>
            </div>

            <div className="space-y-2 text-sm text-slate-600 mb-4">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <span>
                  Início: {new Date(cycle.start_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <span>
                  Fim: {new Date(cycle.end_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => handleEdit(cycle)}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                Editar Datas
              </button>
              {cycle.status === 'active' && (
                <button
                  onClick={() => handleCloseCycle(cycle.id)}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                >
                  Encerrar Ciclo
                </button>
              )}
            </div>
          </div>
        ))}
        {cycles.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-500">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>Nenhum ciclo cadastrado</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-slate-800 mb-4">
                {editingCycle ? 'Editar Ciclo' : 'Iniciar Novo Ciclo'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Nome do Ciclo
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="Ex: Ciclo 2024.1"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Data de Início
                    </label>
                    <input
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Data de Fim
                    </label>
                    <input
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    {editingCycle ? 'Atualizar' : 'Iniciar Ciclo'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
