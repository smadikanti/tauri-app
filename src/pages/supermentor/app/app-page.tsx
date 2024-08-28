import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ReactMarkdown from 'react-markdown';
import Anthropic from '@anthropic-ai/sdk';

// Import prompts
import behavioralPrompt from './prompts/behavioral.txt';
import technicalPrompt from './prompts/technical.txt';
import codingPrompt from './prompts/coding.txt';
import systemDesignPrompt from './prompts/system_design.txt';
import metaPrompt from './prompts/metaprompt.txt';

const SuperMentorPage: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [generatedText, setGeneratedText] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [mode, setMode] = useState('behavioral');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [jd, setJd] = useState('');
  const [resume, setResume] = useState('');

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isRecording && !isGenerating && transcript.trim() !== '') {
        event.preventDefault();
        handleGenerate();
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [isRecording, isGenerating, transcript]);

  const addLog = (message: string) => {
    setLogs(prevLogs => [...prevLogs, `${new Date().toISOString()}: ${message}`]);
    console.log(message);
  };

  const startRecording = async () => {
    try {
      addLog('Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      addLog('Microphone access granted.');
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          addLog(`Received audio chunk of size: ${event.data.size} bytes`);
        }
      };

      mediaRecorder.start();
      addLog('Started recording.');
      setIsRecording(true);
    } catch (error) {
      addLog(`Error starting recording: ${error}`);
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      addLog('Stopped recording.');
      setIsRecording(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  const generateTranscript = async () => {
    addLog('Preparing audio data for transcription...');
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      addLog('Stopped recording for transcription.');
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    addLog(`Audio blob created. Size: ${audioBlob.size} bytes`);
    
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-large-v3');

    try {
      addLog('Sending request to Groq API...');
      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`,
        },
        body: formData,
      });

      addLog(`Received response. Status: ${response.status}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      addLog('Successfully parsed response JSON.');
      setTranscript(prevTranscript => prevTranscript + ' ' + data.text);
      addLog(`Transcription appended: ${data.text.substring(0, 50)}...`);

      // Generate text based on the transcript
      await generateAnthropicAnswer(data.text);
    } catch (error) {
      addLog(`Error transcribing audio: ${error}`);
      console.error('Error transcribing audio:', error);
      setTranscript(prevTranscript => prevTranscript + ' Error transcribing audio. Please try again.');
    }
  };

  const generateAnthropicAnswer = async (transcriptText: string) => {
    setIsGenerating(true);
    addLog('Generating answer with Anthropic...');

    try {
      const promptText = getPromptForMode(mode);
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

      if (!apiKey) {
        throw new Error('Anthropic API key is not set');
      }

      const anthropic = new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true
      });

      const stream = await anthropic.messages.stream({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4096,
        messages: [
          { role: "system", content: metaPrompt },
          { role: "user", content: `${promptText}\n\n[QUESTION]\n${transcriptText}` }
        ],
      });

      let generatedContent = '';
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          generatedContent += chunk.delta.text ?? '';
          setGeneratedText(prevText => prevText + (chunk.delta.text ?? ''));
        }
      }

      addLog('Answer generation completed.');
    } catch (error) {
      addLog(`Error generating answer: ${error}`);
      console.error('Error generating answer:', error);
      setGeneratedText('Error: Unable to generate answer. Please check your API key and try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const getPromptForMode = (selectedMode: string) => {
    switch (selectedMode) {
      case 'behavioral':
        return behavioralPrompt;
      case 'technical':
        return technicalPrompt;
      case 'coding':
        return codingPrompt;
      case 'system design':
        return systemDesignPrompt;
      default:
        return behavioralPrompt;
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      stopRecording();
      await generateTranscript();
    } else {
      startRecording();
    }
  };

  const handleGenerate = async () => {
    if (transcript.trim()) {
      await generateAnthropicAnswer(transcript);
    } else {
      addLog('No transcript available for generation.');
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-4 sm:p-6 md:p-8 lg:p-24 space-y-6">
      <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">SuperMentor</h1>
      
      <Card className="w-full max-w-4xl">
        <CardContent className="p-6">
          <div className="flex flex-col space-y-4">
            <div className="flex space-x-2">
              <Button
                onClick={toggleRecording}
                className={`flex-1 transition-colors ${isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'} text-white`}
              >
                {isRecording ? (
                  <>
                    <Icons.Square className="mr-2 h-4 w-4" />
                    Stop
                  </>
                ) : (
                  <>
                    <Icons.Mic className="mr-2 h-4 w-4" />
                    Record
                  </>
                )}
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || transcript.trim() === ''}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
              >
                <Icons.Wand className="mr-2 h-4 w-4" />
                {isGenerating ? 'Generating...' : 'Generate'}
              </Button>
            </div>

            <Tabs defaultValue="content">
              <TabsList>
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="candidate">Candidate Profile</TabsTrigger>
                <TabsTrigger value="logs">Logs</TabsTrigger>
              </TabsList>
              <TabsContent value="content">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Mode Pane</h3>
                  <Tabs defaultValue="behavioral" onValueChange={(value) => setMode(value)}>
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="behavioral">Behavioral</TabsTrigger>
                      <TabsTrigger value="technical">Technical</TabsTrigger>
                      <TabsTrigger value="coding">Coding</TabsTrigger>
                      <TabsTrigger value="system design">System Design</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  <div className="min-h-[100px] w-full rounded-md border p-4 overflow-y-auto">
                    <h4 className="font-semibold mb-2">Prompt:</h4>
                    <p className="whitespace-pre-wrap">
                      {getPromptForMode(mode)}
                    </p>
                  </div>

                  <div className="min-h-[100px] w-full rounded-md border p-4 overflow-y-auto">
                    <h4 className="font-semibold mb-2">Transcript:</h4>
                    <p className="whitespace-pre-wrap">
                      {transcript || "Your question will appear here..."}
                    </p>
                  </div>

                  <div className="min-h-[300px] w-full rounded-md border p-4 overflow-y-auto">
                    <h4 className="font-semibold mb-2">Generated Answer:</h4>
                    <ReactMarkdown>
                      {generatedText || "Generated answer will appear here..."}
                    </ReactMarkdown>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="candidate">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Candidate Profile</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold mb-2">Job Description:</h4>
                      <textarea
                        className="w-full h-40 p-2 border rounded"
                        value={jd}
                        onChange={(e) => setJd(e.target.value)}
                        placeholder="Enter job description here..."
                      />
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Resume:</h4>
                      <textarea
                        className="w-full h-40 p-2 border rounded"
                        value={resume}
                        onChange={(e) => setResume(e.target.value)}
                        placeholder="Enter resume here..."
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="logs">
                <div className="h-[200px] w-full rounded-md border p-4 overflow-y-auto">
                  <pre className="text-sm">
                    {logs.join('\n')}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </CardContent>
      </Card>
    </main>
  );
};

export default SuperMentorPage;
