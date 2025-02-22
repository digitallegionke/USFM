import React, { useState, useCallback } from 'react';
import { Editor } from '@monaco-editor/react';
import { Upload, Copy, Download, FileCode, AlertCircle, ArrowRight, Key } from 'lucide-react';
import { toast } from 'sonner';
import mammoth from 'mammoth';
import { ConversionResult, OpenRouterMessage, OpenRouterResponse, OpenRouterError } from '../types';

type EditorChangeHandler = (value: string | undefined) => void;

interface MonacoEditorProps {
  height: string;
  defaultLanguage: string;
  value: string;
  onChange?: EditorChangeHandler;
  options?: {
    minimap?: { enabled: boolean };
    lineNumbers?: 'on' | 'off';
    fontSize?: number;
    wordWrap?: 'on' | 'off';
    readOnly?: boolean;
  };
}

interface USFMConverterProps {
  apiKey: string;
  onLogout: () => void;
}

interface USFMState {
  input: string;
  output: string;
  isProcessing: boolean;
}

export function USFMConverter({ apiKey, onLogout }: USFMConverterProps) {
  const [state, setState] = useState<USFMState>({
    input: '',
    output: '',
    isProcessing: false
  });

  const setInput = useCallback((value: string) => {
    setState((prev: USFMState) => ({ ...prev, input: value }));
  }, []);

  const setOutput = useCallback((value: string) => {
    setState((prev: USFMState) => ({ ...prev, output: value }));
  }, []);

  const setIsProcessing = useCallback((value: boolean) => {
    setState((prev: USFMState) => ({ ...prev, isProcessing: value }));
  }, []);

  // Type guard for OpenRouter response
  const isOpenRouterResponse = (data: OpenRouterResponse | OpenRouterError): data is OpenRouterResponse => {
    return 'choices' in data;
  };

  const convertToUSFM = async (text: string, retries = 3): Promise<ConversionResult> => {
    try {
      // Validate input
      if (!text.trim()) {
        throw new Error('Input text cannot be empty');
      }

      const messages: OpenRouterMessage[] = [
        {
          role: 'system',
          content: `You are a USFM (Unified Standard Format Markers) conversion expert. Your task is to convert study notes into valid USFM format.

Follow these strict guidelines:

1. Document Structure:
  - Start with \\id [BOOK] for book identification
  - Add \\h [Book Name] for running header
  - Add \\mt [Main Title] for main title
  - Use \\ms1 for major section headings
  - Use \\s1 for primary section headings
  - Use \\s2 for subsection headings

2. Verse Handling:
  - Use \\v for verse numbers
  - Support verse ranges (e.g., "1:1-3" becomes "\\v 1-3")
  - Handle verse letters (e.g., "1:1a" becomes "\\v 1a")
  - Extract book and chapter from references (e.g., "John 3:16" -> book="JHN", chapter=3)
  - Store the current verse reference for footnotes

3. Paragraph and Text Flow:
  - Start each new paragraph with \\p
  - Any text not starting with a verse number MUST be preceded by \\p
  - Use \\b for blank lines between paragraphs
  - Maintain proper line breaks and spacing

4. Footnotes:
  - Format: \\f + \\fr [verse] \\ft [footnote text] \\f*
  - Use the verse number from the CURRENT PARAGRAPH only
  - If a footnote appears on the same line as a verse, use that verse number
  - If no verse reference exists in the current paragraph, use \\f + \\ft [footnote text] \\f*
  - Convert "NOTE:" markers to footnotes
  - Clear verse reference when crossing paragraph boundaries

5. Cross References:
  - Format: \\x + \\xo [current_verse] \\xt [reference] \\x*
  - Use \\xo for the origin reference (current verse)
  - Use \\xt for target references
  - Convert bracketed references to cross-references
  - Maintain reference format (e.g., "See John 3:16")

6. Study Notes:
  - Use \\esb [study note] \\esbe for study Bible notes
  - Include category with \\cat when provided
  - Preserve all study note formatting
  - Link study notes to current verse when possible

7. Validation:
  - Ensure all marker pairs (\\f..\\f*, \\x..\\x*, etc.) are properly closed
  - Maintain correct nesting of markers
  - Verify all required headers (\\id, \\h, \\mt) are present
  - Check for proper verse number formatting
  - Validate cross-references point to valid verses

Process each line in this order:
1. Check for verse references first
2. Apply paragraph markers where needed
3. Process footnotes with correct verse association
4. Handle cross-references
5. Format study notes
6. Validate marker pairs

Output only valid USFM markup without explanations or comments.`
        },
        {
          role: 'user',
          content: text
        }
      ];

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'USFM Converter'
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3-opus',
          messages
        })
      });

      const data = await response.json() as OpenRouterResponse | OpenRouterError;
      
      if (!response.ok || 'error' in data) {
        const errorMessage = 'error' in data && data.error?.message
          ? data.error.message
          : 'Failed to convert text';

        switch (response.status) {
          case 401:
            throw new Error('Invalid API key. Please check your OpenRouter API key.');
          case 429:
            throw new Error('Rate limit exceeded. Please try again later.');
          case 402:
            throw new Error('Insufficient credits. Please check your OpenRouter account.');
          case 500:
          case 502:
          case 503:
          case 504:
            throw new Error('OpenRouter API service error. Please try again later.');
          default:
            throw new Error(errorMessage);
        }
      }

      if (!('choices' in data) || !data.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response format');
      }

      const convertedText = data.choices[0].message.content;
      
      // Comprehensive USFM validation
      const requiredMarkers = ['\\id', '\\h', '\\mt'];
      const missingMarkers = requiredMarkers.filter(marker => !convertedText.includes(marker));
      
      if (missingMarkers.length > 0) {
        throw new Error(`Invalid USFM output: Missing required markers: ${missingMarkers.join(', ')}`);
      }

      // Validate marker pairs
      const markerPairs = [
        ['\\f', '\\f*'],
        ['\\x', '\\x*'],
        ['\\esb', '\\esbe']
      ];

      for (const [start, end] of markerPairs) {
        const startCount = (convertedText.match(new RegExp(start, 'g')) || []).length;
        const endCount = (convertedText.match(new RegExp(end, 'g')) || []).length;
        
        if (startCount !== endCount) {
          throw new Error(`Invalid USFM output: Mismatched ${start} markers`);
        }
      }

      return {
        success: true,
        usfm: convertedText
      };
    } catch (error) {
      console.error('Conversion error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unknown error occurred'
      };
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      setInput(result.value);
      toast.success('Document uploaded successfully');
    } catch (error) {
      toast.error('Failed to read document');
    }
  };

  const handleConvert = async () => {
    if (!state.input.trim()) {
      toast.error('Please enter some text to convert');
      return;
    }

    setIsProcessing(true);
    const result = await convertToUSFM(state.input);
    setIsProcessing(false);

    if (result.success && result.usfm) {
      setOutput(result.usfm);
      toast.success('Conversion completed');
    } else {
      toast.error(result.error || 'Conversion failed');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(state.output)
      .then(() => toast.success('Copied to clipboard'))
      .catch(() => toast.error('Failed to copy'));
  };

  const handleDownload = () => {
    const blob = new Blob([state.output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'converted.usfm';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Download started');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 relative">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <FileCode className="w-6 h-6" />
              USFM Converter
            </h1>
            <button
              onClick={onLogout}
              className="text-gray-600 hover:text-gray-900 transition-colors"
              title="Logout"
            >
              <Key className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-2">
            <label className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 cursor-pointer transition-colors">
              <input
                type="file"
                accept=".doc,.docx"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Upload className="w-5 h-5 inline mr-2" />
              Upload Document
            </label>
          </div>
        </div>

        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700">
            <p className="font-semibold mb-1">Input Format Guidelines:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Include verse references (e.g., "John 3:16")</li>
              <li>Mark footnotes with clear indicators</li>
              <li>Separate sections with clear headings</li>
              <li>Include cross-references in brackets</li>
              <li>Mark study notes with clear labels</li>
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-sm">
              <Editor
                height="500px"
                defaultLanguage="plaintext"
                value={state.input}
                onChange={(value: string | undefined) => setInput(value || '')}
                options={{
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  fontSize: 14,
                  wordWrap: 'on'
                }}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-sm">
              <Editor
                height="500px"
                defaultLanguage="plaintext"
                value={state.output}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  fontSize: 14,
                  wordWrap: 'on'
                }}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                disabled={!state.output}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400"
              >
                <Copy className="w-5 h-5 inline mr-2" />
                Copy
              </button>
              <button
                onClick={handleDownload}
                disabled={!state.output}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400"
              >
                <Download className="w-5 h-5 inline mr-2" />
                Download
              </button>
            </div>
          </div>
        </div>

        {/* Floating Convert Button */}
        <button
          onClick={handleConvert}
          disabled={state.isProcessing || !state.input.trim()}
          className={`
            fixed bottom-8 right-8
            flex items-center gap-2
            bg-green-600 text-white
            px-6 py-3 rounded-full
            shadow-lg hover:bg-green-700
            transition-all transform hover:scale-105
            disabled:bg-gray-400 disabled:hover:scale-100
            ${state.isProcessing ? 'animate-pulse' : ''}
          `}
        >
          {state.isProcessing ? (
            'Converting...'
          ) : (
            <>
              Convert
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}