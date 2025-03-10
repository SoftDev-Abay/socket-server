// src/server.ts
import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";

const app = express();

// Enable CORS so your frontend can connect (adjust the origin for production)
app.use(cors());

// Create an HTTP server using Express
const httpServer = createServer(app);

// Initialize Socket.IO server with CORS options
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Change this to your frontend's domain in production
    methods: ["GET", "POST"],
  },
});

// Optional: Define types for your message data
interface Message {
  id: string;
  chatroom_id: string;
  text: string;
  sender: string; // Could be a user ID or a more complex user object
  readBy: string[]; // Array of user IDs who have read the message
  createdAt: string;
}

// Track active users in each chatroom
const activeUsers = new Map<string, Set<string>>(); // chatroomId -> Set of userIds

io.on("connection", (socket: Socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Join a chatroom
  socket.on(
    "join_chat",
    ({ chatroomId, userId }: { chatroomId: string; userId: string }) => {
      socket.join(chatroomId);

      // Add the user to the active users list for this chatroom
      if (!activeUsers.has(chatroomId)) {
        activeUsers.set(chatroomId, new Set());
      }
      activeUsers.get(chatroomId)?.add(userId);

      // Emit the updated list of active users to all clients in the chatroom
      io.to(chatroomId).emit(
        "active_users",
        Array.from(activeUsers.get(chatroomId) || [])
      );

      console.log(`User ${userId} joined chatroom ${chatroomId}`);

      console.log("activeUsers", activeUsers);
    }
  );

  // Leave a chatroom
  socket.on(
    "leave_chat",
    ({ chatroomId, userId }: { chatroomId: string; userId: string }) => {
      socket.leave(chatroomId);

      // Remove the user from the active users list for this chatroom
      if (activeUsers.has(chatroomId)) {
        activeUsers.get(chatroomId)?.delete(userId);

        // Emit the updated list of active users to all clients in the chatroom
        io.to(chatroomId).emit(
          "active_users",
          Array.from(activeUsers.get(chatroomId) || [])
        );
      }

      console.log(`User ${userId} left chatroom ${chatroomId}`);
    }
  );

  // Handle sending a new message
  socket.on("new_message", (data: { chatroomId: string; message: Message }) => {
    const { chatroomId, message } = data;

    // Add readBy for all active users
    if (activeUsers.has(chatroomId)) {
      message.readBy = Array.from(activeUsers.get(chatroomId) || []);
    }

    // Broadcast the new message to all clients in the chatroom
    io.to(chatroomId).emit("new_message", message);

    console.log(`New message in chatroom ${chatroomId}:`, message);
    console.log("activeUsers", activeUsers);
  });

  // Handle marking messages as read
  socket.on(
    "mark_read",
    (data: { chatroomId: string; userId: string; messageIds: string[] }) => {
      const { chatroomId, userId, messageIds } = data;

      // Broadcast the read status to all clients in the chatroom
      io.to(chatroomId).emit("messages_read", { userId, messageIds });

      console.log(
        `User ${userId} marked messages as read in chatroom ${chatroomId}:`,
        messageIds
      );
    }
  );

  // Handle typing notifications
  socket.on(
    "typing",
    (data: { chatroomId: string; userId: string; typing: boolean }) => {
      const { chatroomId, userId, typing } = data;

      // Broadcast the typing status to all clients in the chatroom (except the sender)
      socket.to(chatroomId).emit("typing", { userId, typing, chatroomId });

      console.log(
        `User ${userId} is ${
          typing ? "typing" : "not typing"
        } in chatroom ${chatroomId}`
      );
    }
  );

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);

    // Remove the user from all active chatrooms
    activeUsers.forEach((users, chatroomId) => {
      if (users.has(socket.id)) {
        users.delete(socket.id);
        io.to(chatroomId).emit("active_users", Array.from(users));
      }
    });
  });
});

// Start the server on the specified port
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Socket.IO server is running on port ${PORT}`);
  console.log(`Socket.IO server is running on port ${PORT}`);
});
