import { ChatOpenAI } from 'langchain/chat_models/openai';
import { PromptTemplate } from 'langchain/prompts';
import { StringOutputParser } from 'langchain/schema/output_parser';
import { SupabaseVectorStore } from 'langchain/vectorstores/supabase';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { createClient } from '@supabase/supabase-js';
import { RunnableSequence, RunnablePassthrough } from "langchain/schema/runnable";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function handleOptions(request) {
  if (request.headers.get('Origin') !== null &&
      request.headers.get('Access-Control-Request-Method') !== null &&
      request.headers.get('Access-Control-Request-Headers') !== null) {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  return new Response(null, {
    headers: {
      'Allow': 'GET, HEAD, POST, OPTIONS',
    }
  });
}

function formatConvHistory(history) {
  return history.map((message, i) => {
    const role = i % 2 === 0 ? "Human" : "Assistant";
    return `${role}: ${message}`;
  }).join('\n');
}

function combineDocuments(docs) {
  return docs.map(doc => doc.pageContent).join('\n\n');
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    try {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { 
          status: 405,
          headers: corsHeaders
        });
      }

      const { question, convHistory } = await request.json();
      
      if (!question) {
        return new Response("Question is required", { 
          status: 400,
          headers: corsHeaders
        });
      }

      // Initialize clients
      const llm = new ChatOpenAI({ 
        openAIApiKey: env.OPENAI_API_KEY 
      });
      
      const embeddings = new OpenAIEmbeddings({ 
        openAIApiKey: env.OPENAI_API_KEY 
      });

      const client = createClient(env.SUPABASE_URL_ASSISTANT, env.SUPABASE_API_KEY);
      
      const vectorStore = new SupabaseVectorStore(embeddings, {
        client,
        tableName: 'documents',
        queryName: 'match_documents'
      });

      const retriever = vectorStore.asRetriever();

      // Set up the chains
      const standaloneQuestionTemplate = `Given some conversation history (if any) and a question, convert the question to a standalone question. 
      conversation history: {conv_history}
      question: {question} 
      standalone question:`;
      
      const standaloneQuestionPrompt = PromptTemplate.fromTemplate(standaloneQuestionTemplate);

      const answerTemplate = `You are a helpful and enthusiastic personal assistant who can answer a given question about me based on the context provided and the conversation history. Try to find the answer in the context. If the answer is not given in the context, find the answer in the conversation history if possible. If you really don't know the answer, say "I'm sorry, I don't know the answer to that." Don't try to make up an answer. Always speak as if you were chatting to a friend.
      context: {context}
      conversation history: {conv_history}
      question: {question}
      answer: `;
      
      const answerPrompt = PromptTemplate.fromTemplate(answerTemplate);

      const standaloneQuestionChain = standaloneQuestionPrompt
        .pipe(llm)
        .pipe(new StringOutputParser());

      const retrieverChain = RunnableSequence.from([
        prevResult => prevResult.standalone_question,
        retriever,
        combineDocuments
      ]);

      const answerChain = answerPrompt
        .pipe(llm)
        .pipe(new StringOutputParser());

      const chain = RunnableSequence.from([
        {
          standalone_question: standaloneQuestionChain,
          original_input: new RunnablePassthrough()
        },
        {
          context: retrieverChain,
          question: ({ original_input }) => original_input.question,
          conv_history: ({ original_input }) => original_input.conv_history
        },
        answerChain
      ]);

      // Run the chain
      const response = await chain.invoke({
        question: question,
        conv_history: formatConvHistory(convHistory || [])
      });

      return new Response(JSON.stringify({ response }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });

    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({ 
        error: "Error processing your request. Please try again." 
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
};