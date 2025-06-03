
'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Lightbulb, MessageSquarePlus, Send, X, Bot, User } from 'lucide-react';
import { handleUserSuggestion, type HandleSuggestionInput, type HandleSuggestionOutput } from '@/ai/flows/handle-suggestion-flow';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext'; // Import useAuth

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
}

export function SuggestionsBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { currentUser } = useAuth(); // Get current user

  useEffect(() => {
    if (isOpen && messages.length === 0 && !isLoading) {
        // Initial welcome message from the bot
        setMessages([{ id: crypto.randomUUID(), text: "Hi there! I'm the LexiVerse suggestions bot. Have any ideas to make the game better? Let me know!", sender: 'bot' }]);
    }
  }, [isOpen, messages.length, isLoading]);

  useEffect(() => {
    // Auto-scroll to bottom
    if (scrollAreaRef.current) {
      const scrollableViewport = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
      if (scrollableViewport) {
        scrollableViewport.scrollTop = scrollableViewport.scrollHeight;
      }
    }
  }, [messages]);

  const toggleBot = () => setIsOpen(!isOpen);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const currentSuggestionText = inputValue;
    const userMessage: Message = {
      id: crypto.randomUUID(),
      text: currentSuggestionText,
      sender: 'user',
    };

    // Prepare conversation history *before* adding the new user message to the UI state
    const historyForFlow = messages.map(m => ({
        role: m.sender === 'user' ? 'user' : 'model',
        content: m.text,
    }));

    setMessages((prev) => [...prev, userMessage]); // Update UI with user's message
    setInputValue(''); // Clear input
    setIsLoading(true);

    try {
      const flowInput: HandleSuggestionInput = {
        userId: currentUser?.uid, // Pass userId if available
        suggestionText: currentSuggestionText,
        conversationHistory: historyForFlow,
      };
      const result: HandleSuggestionOutput = await handleUserSuggestion(flowInput);
      const botMessage: Message = {
        id: crypto.randomUUID(),
        text: result.response,
        sender: 'bot',
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error("Error getting suggestion response:", error);
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        text: "Sorry, I had a little trouble processing that. Please try again!",
        sender: 'bot',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={toggleBot}
        variant="default"
        size="icon"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-xl z-50 bg-primary hover:bg-primary/90"
        aria-label="Toggle suggestions bot"
      >
        {isOpen ? <X className="h-7 w-7" /> : <MessageSquarePlus className="h-7 w-7" />}
      </Button>

      {isOpen && (
        <Card className="fixed bottom-24 right-6 w-80 sm:w-96 h-[500px] shadow-2xl z-40 flex flex-col bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-6 w-6 text-primary" />
              <CardTitle className="text-lg font-semibold">Suggestions Bot</CardTitle>
            </div>
            <Button variant="ghost" size="icon" onClick={toggleBot} className="h-7 w-7">
                <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="flex-grow p-0 overflow-hidden">
            <ScrollArea className="h-full p-4" ref={scrollAreaRef}>
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex items-end gap-2 max-w-[85%]",
                      msg.sender === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                    )}
                  >
                    {msg.sender === 'bot' && <Bot className="h-6 w-6 text-primary shrink-0 mb-1" />}
                    {msg.sender === 'user' && <User className="h-6 w-6 text-accent shrink-0 mb-1" />}
                    <div
                      className={cn(
                        "p-3 rounded-lg shadow-sm text-sm",
                        msg.sender === 'user'
                          ? 'bg-primary text-primary-foreground rounded-br-none'
                          : 'bg-muted text-muted-foreground rounded-bl-none'
                      )}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex items-end gap-2 mr-auto">
                     <Bot className="h-6 w-6 text-primary shrink-0 mb-1" />
                    <div className="p-3 rounded-lg shadow-sm bg-muted text-muted-foreground rounded-bl-none">
                      <span className="italic">Bot is typing...</span>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
          <CardFooter className="p-3 border-t">
            <div className="flex w-full items-center gap-2">
              <Input
                type="text"
                placeholder="Type your suggestion..."
                value={inputValue}
                onChange={handleInputChange}
                onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSendMessage()}
                disabled={isLoading}
                className="flex-grow"
              />
              <Button onClick={handleSendMessage} disabled={isLoading || !inputValue.trim()} size="icon">
                <Send className="h-5 w-5" />
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}
    </>
  );
}

