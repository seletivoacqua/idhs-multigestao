import { useState, useEffect } from 'react';
import { Plus, FileText, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface MeetingMinute {
  id: string;
  title: string;
  header_text: string;
  logo_url?: string;
  content: string;
  meeting_date: string;
  created_at: string;
}

export function ControleInstitucionalTab() {
  const [minutes, setMinutes] = useState<MeetingMinute[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingMinute, setEditingMinute] = useState<MeetingMinute | null>(null);
  const { user } = useAuth();

  const defaultHeader = 'ATA DE SESSÃO ORDINÁRIA MENSAL DA DIRETORIA EXECUTIVA DO INSTITUTO DO DESENVOLVIMENTO HUMANO E SOCIAL – IDHS';

  const [formData, setFormData] = useState({
    title: '',
    header_text: defaultHeader,
    logo_url: '',
    content: '',
    meeting_date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    loadMinutes();
  }, []);

  const loadMinutes = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('meeting_minutes')
      .select('*')
      .eq('user_id', user.id)
      .order('meeting_date', { ascending: false });

    if (error) {
      console.error('Error loading meeting minutes:', error);
      return;
    }

    setMinutes(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (editingMinute) {
      const { error } = await supabase
        .from('meeting_minutes')
        .update({
          title: formData.title,
          header_text: formData.header_text,
          logo_url: formData.logo_url || null,
          content: formData.content,
          meeting_date: formData.meeting_date,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingMinute.id);

      if (error) {
        console.error('Error updating meeting minute:', error);
        alert('Erro ao atualizar ata');
        return;
      }
    } else {
      const { error } = await supabase.from('meeting_minutes').insert([
        {
          user_id: user.id,
          title: formData.title,
          header_text: formData.header_text,
          logo_url: formData.logo_url || null,
          content: formData.content,
          meeting_date: formData.meeting_date,
        },
      ]);

      if (error) {
        console.error('Error adding meeting minute:', error);
        alert('Erro ao adicionar ata');
        return;
      }
    }

    resetForm();
    loadMinutes();
  };

  const resetForm = () => {
    setShowModal(false);
    setEditingMinute(null);
    setFormData({
      title: '',
      header_text: defaultHeader,
      logo_url: '',
      content: '',
      meeting_date: new Date().toISOString().split('T')[0],
    });
  };

  const handleEdit = (minute: MeetingMinute) => {
    setEditingMinute(minute);
    setFormData({
      title: minute.title,
      header_text: minute.header_text,
      logo_url: minute.logo_url || '',
      content: minute.content,
      meeting_date: minute.meeting_date,
    });
    setShowModal(true);
  };

  const handleView = (minute: MeetingMinute) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${minute.title}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 40px;
              max-width: 800px;
              margin: 0 auto;
              line-height: 1.6;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              border-bottom: 2px solid #333;
              padding-bottom: 20px;
            }
            .header img {
              max-width: 150px;
              margin-bottom: 20px;
            }
            .header h1 {
              font-size: 16px;
              font-weight: bold;
              text-transform: uppercase;
              margin: 10px 0;
            }
            .title {
              font-size: 18px;
              font-weight: bold;
              margin: 20px 0;
              text-align: center;
            }
            .date {
              text-align: right;
              margin-bottom: 20px;
              color: #666;
            }
            .content {
              white-space: pre-wrap;
              text-align: justify;
            }
            @media print {
              body {
                padding: 20px;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            ${minute.logo_url ? `<img src="${minute.logo_url}" alt="Logo IDHS" />` : ''}
            <h1>${minute.header_text}</h1>
          </div>
          <div class="title">${minute.title}</div>
          <div class="date">Data: ${new Date(minute.meeting_date).toLocaleDateString('pt-BR')}</div>
          <div class="content">${minute.content}</div>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-800">Atas de Reunião</h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Nova Ata</span>
        </button>
      </div>

      <div className="grid gap-4">
        {minutes.map((minute) => (
          <div
            key={minute.id}
            className="bg-white border border-slate-200 rounded-lg p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <FileText className="w-6 h-6 text-blue-600" />
                  <h3 className="text-lg font-semibold text-slate-800">{minute.title}</h3>
                </div>
                <p className="text-sm text-slate-600 mb-2">
                  Data da Reunião: {new Date(minute.meeting_date).toLocaleDateString('pt-BR')}
                </p>
                <p className="text-sm text-slate-500 line-clamp-2">{minute.content}</p>
              </div>
              <div className="flex space-x-2 ml-4">
                <button
                  onClick={() => handleView(minute)}
                  className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm"
                >
                  Visualizar
                </button>
                <button
                  onClick={() => handleEdit(minute)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Editar
                </button>
              </div>
            </div>
          </div>
        ))}
        {minutes.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>Nenhuma ata cadastrada</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-6 my-8">
            <h3 className="text-xl font-bold text-slate-800 mb-4">
              {editingMinute ? 'Editar Ata' : 'Nova Ata de Reunião'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Título da Ata</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  placeholder="Ex: Ata da Reunião Ordinária - Janeiro 2024"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Cabeçalho da Ata (editável)
                </label>
                <textarea
                  value={formData.header_text}
                  onChange={(e) => setFormData({ ...formData, header_text: e.target.value })}
                  required
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <div className="flex items-center space-x-2">
                    <ImageIcon className="w-4 h-4" />
                    <span>URL da Logomarca (opcional)</span>
                  </div>
                </label>
                <input
                  type="url"
                  value={formData.logo_url}
                  onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                  placeholder="https://exemplo.com/logo.png"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {formData.logo_url && (
                  <div className="mt-2">
                    <img
                      src={formData.logo_url}
                      alt="Preview da logo"
                      className="max-w-xs max-h-32 object-contain border border-slate-200 rounded p-2"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Data da Reunião</label>
                <input
                  type="date"
                  value={formData.meeting_date}
                  onChange={(e) => setFormData({ ...formData, meeting_date: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Conteúdo da Ata</label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  required
                  rows={12}
                  placeholder="Digite aqui o conteúdo completo da ata de reunião..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
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
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {editingMinute ? 'Atualizar' : 'Criar Ata'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
