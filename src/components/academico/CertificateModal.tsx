import { useState, useRef, useEffect } from 'react';
import { X, Download, Edit2, Save, Upload, Trash2 } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import logoImg from '../../assets/image.png';
import { supabase } from '../../lib/supabase';

interface CertificateModalProps {
  studentName: string;
  courseName: string;
  courseModules: string[];
  workload: number;
  startDate: string;
  endDate: string;
  onClose: () => void;
}

// Função para converter números para extenso em português
const numeroParaExtenso = (numero: number): string => {
  if (numero < 0) return 'número inválido';
  if (numero > 999) return 'muitas';
  
  if (numero === 0) return 'zero';
  if (numero === 100) return 'cem';
  
  const unidades = [
    '', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
    'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 
    'dezessete', 'dezoito', 'dezenove'
  ];
  
  const dezenas = [
    '', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 
    'setenta', 'oitenta', 'noventa'
  ];
  
  const centenas = [
    '', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
    'seiscentos', 'setecentos', 'oitocentos', 'novecentos'
  ];
  
  let extenso = '';
  let resto = numero;
  
  // Centenas
  if (resto >= 100) {
    const centena = Math.floor(resto / 100);
    extenso = centenas[centena];
    resto = resto % 100;
    
    if (resto > 0) {
      extenso += ' e ';
    }
  }
  
  // Dezenas e unidades
  if (resto > 0) {
    if (resto < 20) {
      extenso += unidades[resto];
    } else {
      const dezena = Math.floor(resto / 10);
      const unidade = resto % 10;
      extenso += dezenas[dezena];
      
      if (unidade > 0) {
        extenso += ' e ' + unidades[unidade];
      }
    }
  }
  
  return extenso;
};

// Função para obter o texto completo da carga horária
const obterCargaHorariaExtenso = (cargaHoraria: number): string => {
  if (cargaHoraria <= 0) return 'carga horária não especificada';
  
  const numeroExtenso = numeroParaExtenso(cargaHoraria);
  const horaTexto = cargaHoraria === 1 ? 'hora' : 'horas';
  
  return `${numeroExtenso} ${horaTexto}`;
};

// Função para capitalizar primeira letra
const capitalizarPrimeiraLetra = (texto: string): string => {
  if (!texto) return texto;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

export function CertificateModal({
  studentName,
  courseName,
  courseModules,
  workload,
  startDate,
  endDate,
  onClose,
}: CertificateModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showBack, setShowBack] = useState(false);
  const [editableData, setEditableData] = useState({
    studentName,
    courseName,
    workload: workload.toString(),
    startDate,
    endDate,
    modules: [...courseModules],
  });
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [signaturePosition, setSignaturePosition] = useState({ x: 50, y: 70 });
  const [isDraggingSignature, setIsDraggingSignature] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isUploadingSignature, setIsUploadingSignature] = useState(false);
  const [availableSignatures, setAvailableSignatures] = useState<any[]>([]);
  const [showSignatureMenu, setShowSignatureMenu] = useState(false);

  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAvailableSignatures();
  }, []);

  const loadAvailableSignatures = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('signatures')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setAvailableSignatures(data);
    }
  };

  const handleSignatureUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione um arquivo de imagem (PNG, JPG, etc.)');
      return;
    }

    setIsUploadingSignature(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Você precisa estar autenticado para fazer upload de assinatura');
        return;
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('signatures')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('signatures')
        .getPublicUrl(fileName);

      const { error: dbError } = await supabase
        .from('signatures')
        .insert({
          user_id: user.id,
          image_url: publicUrl,
          name: 'Assinatura'
        });

      if (dbError) throw dbError;

      setSignatureUrl(publicUrl);
      await loadAvailableSignatures();
      setShowSignatureMenu(false);
      alert('Assinatura carregada com sucesso!');
    } catch (error: any) {
      console.error('Erro ao fazer upload:', error);
      alert('Erro ao fazer upload da assinatura: ' + error.message);
    } finally {
      setIsUploadingSignature(false);
    }
  };

  const handleDeleteSignature = async (signatureId: string, imageUrl: string) => {
    if (!confirm('Deseja realmente excluir esta assinatura?')) return;

    try {
      const filePath = imageUrl.split('/signatures/')[1];

      await supabase.storage
        .from('signatures')
        .remove([filePath]);

      await supabase
        .from('signatures')
        .delete()
        .eq('id', signatureId);

      if (signatureUrl === imageUrl) {
        setSignatureUrl(null);
      }

      await loadAvailableSignatures();
    } catch (error: any) {
      console.error('Erro ao excluir assinatura:', error);
      alert('Erro ao excluir assinatura');
    }
  };

  const handleSignatureMouseDown = (e: React.MouseEvent) => {
    if (!signatureUrl || !frontRef.current) return;

    setIsDraggingSignature(true);
    const signatureElement = e.currentTarget as HTMLElement;
    const signatureRect = signatureElement.getBoundingClientRect();

    setDragOffset({
      x: e.clientX - signatureRect.left,
      y: e.clientY - signatureRect.top
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingSignature || !frontRef.current) return;

    const rect = frontRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left - dragOffset.x) / rect.width) * 100;
    const y = ((e.clientY - rect.top - dragOffset.y) / rect.height) * 100;

    setSignaturePosition({
      x: Math.max(0, Math.min(85, x)),
      y: Math.max(0, Math.min(85, y))
    });
  };

  const handleMouseUp = () => {
    setIsDraggingSignature(false);
  };

  const handleGeneratePDF = async () => {
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    if (frontRef.current) {
      const canvas = await html2canvas(frontRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    }

    if (backRef.current) {
      pdf.addPage();
      const canvas = await html2canvas(backRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    }

    pdf.save(`Certificado_${editableData.studentName.replace(/\s+/g, '_')}.pdf`);
  };

  const handleSaveEdit = () => {
    setIsEditing(false);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const validarCargaHoraria = (valor: string): string => {
    // Remove tudo que não é número
    const apenasNumeros = valor.replace(/\D/g, '');
    
    // Limita a 3 dígitos (máximo 999 horas)
    const limitado = apenasNumeros.slice(0, 3);
    
    // Não permite zero à esquerda, exceto para o próprio zero
    const numero = parseInt(limitado) || 0;
    
    return numero.toString();
  };

  const today = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  // Calcula a carga horária por extenso
  const workloadNumber = parseInt(editableData.workload) || 0;
  const cargaHorariaExtenso = capitalizarPrimeiraLetra(obterCargaHorariaExtenso(workloadNumber));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[95vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-2xl font-bold text-slate-800">Certificado de Conclusão</h3>
            <p className="text-slate-600 mt-1">{editableData.studentName}</p>
          </div>
          <div className="flex items-center space-x-3">
            <div className="relative">
              <button
                onClick={() => setShowSignatureMenu(!showSignatureMenu)}
                className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                <Upload className="w-5 h-5" />
                <span>Assinatura</span>
              </button>

              {showSignatureMenu && (
                <div className="absolute top-full mt-2 right-0 bg-white rounded-lg shadow-xl border border-slate-200 p-4 w-80 z-50">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-semibold text-slate-800">Gerenciar Assinaturas</h4>
                    <button onClick={() => setShowSignatureMenu(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingSignature}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-300 mb-3"
                  >
                    <Upload className="w-5 h-5" />
                    <span>{isUploadingSignature ? 'Enviando...' : 'Upload Nova Assinatura'}</span>
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleSignatureUpload}
                    className="hidden"
                  />

                  {availableSignatures.length > 0 && (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      <p className="text-sm text-slate-600 mb-2">Assinaturas salvas:</p>
                      {availableSignatures.map((sig) => (
                        <div key={sig.id} className="flex items-center space-x-2 p-2 border border-slate-200 rounded hover:bg-slate-50">
                          <img src={sig.image_url} alt="Assinatura" className="h-12 w-auto object-contain" />
                          <div className="flex-1">
                            <p className="text-sm text-slate-700">{sig.name}</p>
                          </div>
                          <button
                            onClick={() => {
                              setSignatureUrl(sig.image_url);
                              setShowSignatureMenu(false);
                            }}
                            className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                          >
                            Usar
                          </button>
                          <button
                            onClick={() => handleDeleteSignature(sig.id, sig.image_url)}
                            className="p-1 text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {signatureUrl && (
                    <button
                      onClick={() => setSignatureUrl(null)}
                      className="w-full mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Remover Assinatura do Certificado
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                isEditing
                  ? 'bg-slate-600 text-white hover:bg-slate-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isEditing ? (
                <>
                  <Save className="w-5 h-5" />
                  <span>Salvar</span>
                </>
              ) : (
                <>
                  <Edit2 className="w-5 h-5" />
                  <span>Editar</span>
                </>
              )}
            </button>
            {isEditing && (
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Concluir Edição
              </button>
            )}
            <button
              onClick={handleGeneratePDF}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-5 h-5" />
              <span>Baixar PDF</span>
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-3xl p-2"
            >
              <X className="w-8 h-8" />
            </button>
          </div>
        </div>

        <div className="p-8 space-y-6">
          <div className="flex justify-center space-x-4 mb-6">
            <button
              onClick={() => setShowBack(false)}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                !showBack
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              Frente
            </button>
            <button
              onClick={() => setShowBack(true)}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                showBack
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              Verso
            </button>
          </div>

          {!showBack ? (
            <div
              ref={frontRef}
              className="bg-white border-2 border-slate-300 aspect-[297/210] w-full relative overflow-hidden"
              style={{
                backgroundImage: 'linear-gradient(to bottom right, #f8fafc 0%, #ffffff 100%)',
                cursor: isDraggingSignature ? 'grabbing' : 'default'
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <div className="absolute top-0 left-0 w-32 h-32 border-l-[40px] border-t-[40px] border-l-[#60a5fa] border-t-[#60a5fa] opacity-80"></div>
              <div className="absolute top-8 left-8 w-24 h-24 border-l-[30px] border-t-[30px] border-l-[#1e40af] border-t-[#1e40af] opacity-60"></div>

              <div className="absolute bottom-0 right-0 w-32 h-32 border-r-[40px] border-b-[40px] border-r-[#60a5fa] border-b-[#60a5fa] opacity-80"></div>
              <div className="absolute bottom-8 right-8 w-24 h-24 border-r-[30px] border-b-[30px] border-r-[#1e40af] border-b-[#1e40af] opacity-60"></div>

              <div className="relative z-10 p-12 h-full flex flex-col justify-between">
                <div className="flex justify-center">
                  <div className="text-center">
                    <img src={logoImg} alt="IDHS" className="h-20 mx-auto mb-2" />
                    <p className="text-sm text-slate-600">Instituto do Desenvolvimento</p>
                    <p className="text-sm text-slate-600">Humano e Social</p>
                  </div>
                </div>

                <div className="flex-1 flex flex-col justify-center text-center px-8">
                  <h1 className="text-4xl font-bold text-slate-800 mb-8 tracking-wide">
                    CERTIFICADO DE CONCLUSÃO
                  </h1>

                  <div className="space-y-6 text-slate-700">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editableData.studentName}
                        onChange={(e) =>
                          setEditableData({ ...editableData, studentName: e.target.value })
                        }
                        className="text-3xl font-bold text-center w-full uppercase border-b-2 border-slate-300 focus:border-green-500 focus:outline-none"
                      />
                    ) : (
                      <h2 className="text-3xl font-bold uppercase">{editableData.studentName}</h2>
                    )}

                    <div className="text-lg leading-relaxed max-w-4xl mx-auto">
                      <p className="mb-4">
                        Concluiu o curso de{' '}
                        {isEditing ? (
                          <input
                            type="text"
                            value={editableData.courseName}
                            onChange={(e) =>
                              setEditableData({ ...editableData, courseName: e.target.value })
                            }
                            className="font-bold border-b border-slate-300 focus:border-green-500 focus:outline-none px-2"
                          />
                        ) : (
                          <span className="font-bold">{editableData.courseName}</span>
                        )}
                        , realizado no período de{' '}
                        {isEditing ? (
                          <input
                            type="date"
                            value={editableData.startDate}
                            onChange={(e) =>
                              setEditableData({ ...editableData, startDate: e.target.value })
                            }
                            className="border-b border-slate-300 focus:border-green-500 focus:outline-none px-2"
                          />
                        ) : (
                          formatDate(editableData.startDate)
                        )}{' '}
                        a{' '}
                        {isEditing ? (
                          <input
                            type="date"
                            value={editableData.endDate}
                            onChange={(e) =>
                              setEditableData({ ...editableData, endDate: e.target.value })
                            }
                            className="border-b border-slate-300 focus:border-green-500 focus:outline-none px-2"
                          />
                        ) : (
                          formatDate(editableData.endDate)
                        )}
                        , pela plataforma de videoconferência, promovido pelo{' '}
                        <span className="font-bold">Instituto do Desenvolvimento Humano e Social - IDHS</span>, com
                        carga horária de{' '}
                        {isEditing ? (
                          <input
                            type="text"
                            value={editableData.workload}
                            onChange={(e) =>
                              setEditableData({ 
                                ...editableData, 
                                workload: validarCargaHoraria(e.target.value)
                              })
                            }
                            className="w-20 border-b border-slate-300 focus:border-green-500 focus:outline-none px-2 text-center"
                          />
                        ) : (
                          editableData.workload
                        )}{' '}
                        ({cargaHorariaExtenso}).
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-end">
                  <div className="text-left text-sm text-slate-600">
                    <p>São Luis (MA), {today}.</p>
                  </div>
                  <div className="text-center">
                    <div className="mb-2">
                      <div className="w-64 border-t-2 border-slate-400 mx-auto mb-1"></div>
                      <p className="text-sm font-semibold text-slate-700">Marcelo Henrique de Oliveira Malheiros</p>
                      <p className="text-xs text-slate-600">Diretor-Presidente do IDHS</p>
                      <p className="text-xs text-slate-600">CNPJ: 05.832.015/0001-30</p>
                    </div>
                  </div>
                  <div className="w-32"></div>
                </div>
              </div>

              {signatureUrl && (
                <div
                  className="absolute z-20"
                  style={{
                    left: `${signaturePosition.x}%`,
                    top: `${signaturePosition.y}%`,
                    cursor: isDraggingSignature ? 'grabbing' : 'grab'
                  }}
                  onMouseDown={handleSignatureMouseDown}
                >
                  <img
                    src={signatureUrl}
                    alt="Assinatura"
                    className="h-16 w-auto object-contain pointer-events-none select-none"
                    draggable={false}
                  />
                  {!isDraggingSignature && (
                    <div className="text-xs text-center text-slate-500 mt-1 bg-white bg-opacity-80 px-2 py-1 rounded">
                      Arraste para posicionar
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div
              ref={backRef}
              className="bg-white border-2 border-slate-300 aspect-[297/210] w-full relative overflow-hidden"
              style={{
                backgroundImage: 'linear-gradient(to bottom right, #f8fafc 0%, #ffffff 100%)',
              }}
            >
              <div className="absolute top-0 left-0 w-32 h-32 border-l-[40px] border-t-[40px] border-l-[#60a5fa] border-t-[#60a5fa] opacity-80"></div>
              <div className="absolute top-8 left-8 w-24 h-24 border-l-[30px] border-t-[30px] border-l-[#1e40af] border-t-[#1e40af] opacity-60"></div>

              <div className="absolute bottom-0 right-0 w-32 h-32 border-r-[40px] border-b-[40px] border-r-[#60a5fa] border-b-[#60a5fa] opacity-80"></div>
              <div className="absolute bottom-8 right-8 w-24 h-24 border-r-[30px] border-b-[30px] border-r-[#1e40af] border-b-[#1e40af] opacity-60"></div>

              <div className="relative z-10 p-12 h-full flex flex-col">
                <div className="flex justify-center mb-8">
                  <div className="text-center">
                    <img src={logoImg} alt="IDHS" className="h-16 mx-auto mb-2" />
                    <p className="text-sm text-slate-600">Instituto do Desenvolvimento</p>
                    <p className="text-sm text-slate-600">Humano e Social</p>
                  </div>
                </div>

                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-slate-800 mb-6">MÓDULOS:</h2>
                  <div className="space-y-3 text-slate-700 text-lg">
                    {isEditing ? (
                      <div className="space-y-2">
                        {editableData.modules.map((module, index) => (
                          <div key={index} className="flex items-center space-x-2">
                            <span className="font-medium">{index + 1}.</span>
                            <input
                              type="text"
                              value={module}
                              onChange={(e) => {
                                const newModules = [...editableData.modules];
                                newModules[index] = e.target.value;
                                setEditableData({ ...editableData, modules: newModules });
                              }}
                              className="flex-1 border-b border-slate-300 focus:border-green-500 focus:outline-none px-2"
                            />
                            <button
                              onClick={() => {
                                const newModules = editableData.modules.filter((_, i) => i !== index);
                                setEditableData({ ...editableData, modules: newModules });
                              }}
                              className="text-red-600 hover:text-red-800"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => {
                            setEditableData({
                              ...editableData,
                              modules: [...editableData.modules, 'Novo módulo'],
                            });
                          }}
                          className="mt-2 px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                        >
                          Adicionar Módulo
                        </button>
                      </div>
                    ) : (
                      editableData.modules.map((module, index) => (
                        <p key={index}>
                          {index + 1}. {module}
                        </p>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
