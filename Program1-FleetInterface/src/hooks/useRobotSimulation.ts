import { useState, useEffect, useRef } from 'react';
import { type DBNode, type DBEdge } from '../types/database';

export interface RobotStatus {
  id: string;
  x: number;
  y: number;
  battery: number;
  status: 'IDLE' | 'MOVING' | 'ERROR' | 'CHARGING';
  current_task?: string;
}

export const useRobotSimulation = (nodes: DBNode[], edges: DBEdge[]) => {
  const [robots, setRobots] = useState<RobotStatus[]>([]);
  
  // Refs to keep track of animation state without triggering re-renders
  const robotStateRef = useRef<any[]>([]);

  // Initialize Robots when map loads
  useEffect(() => {
    if (nodes.length === 0) return;

    // Create 3 Fake Robots at random nodes
    const initialRobots = ['R-01', 'R-02', 'R-03'].map(id => {
      const randomNode = nodes[Math.floor(Math.random() * nodes.length)];
      return {
        id,
        x: randomNode.x * 100, // Scale to pixels
        y: randomNode.y * 100,
        battery: 80 + Math.floor(Math.random() * 20),
        status: 'IDLE' as const,
        targetNodeIndex: -1,
        progress: 0
      };
    });

    robotStateRef.current = initialRobots;
    setRobots(initialRobots);

  }, [nodes]);

  // Animation Loop (Simulates receiving MQTT updates 60fps)
  useEffect(() => {
    if (nodes.length === 0 || edges.length === 0) return;

    const interval = setInterval(() => {
      robotStateRef.current = robotStateRef.current.map(robot => {
        // Simple logic: If IDLE, pick a random connected node and move there
        if (robot.status === 'IDLE') {
           // Find neighbors (very inefficient search, but fine for 3 robots)
           // In real app, you'd use the backend data
           return { ...robot, status: 'MOVING', progress: 0, targetNode: nodes[Math.floor(Math.random() * nodes.length)] };
        }

        if (robot.status === 'MOVING' && robot.targetNode) {
          // Move 5 pixels towards target
          const dx = (robot.targetNode.x * 100) - robot.x;
          const dy = (robot.targetNode.y * 100) - robot.y;
          const dist = Math.sqrt(dx*dx + dy*dy);

          if (dist < 5) {
             // Arrived
             return { ...robot, x: robot.targetNode.x * 100, y: robot.targetNode.y * 100, status: 'IDLE' };
          } else {
             // Step
             return { ...robot, x: robot.x + (dx/dist)*2, y: robot.y + (dy/dist)*2 };
          }
        }
        return robot;
      });

      // Update State for React to Render
      setRobots([...robotStateRef.current]);

    }, 50); // 20 updates per second

    return () => clearInterval(interval);
  }, [nodes, edges]);

  return robots;
};